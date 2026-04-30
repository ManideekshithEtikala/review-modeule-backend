
require('dotenv').config(); // only for local dev; Render/Railway/Vercel use env vars
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { count } = require('console');

const app = express();

// ---------- CORS ----------
// Use FRONTEND_ORIGIN in production; fallback to localhost for local dev
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());

// ---------- DB pool (supports DATABASE_URL or individual env vars) ----------
let pool;

try {
  let sslOptions;
  if (process.env.DB_SSL === 'true') {
    const certPath = path.resolve(__dirname, 'certs', 'aiven-ca.pem');
    if (fs.existsSync(certPath)) {
      sslOptions = {
        ca: fs.readFileSync(certPath),
        rejectUnauthorized: true,
      };
      console.log('🔐 Using Aiven CA certificate for SSL');
    } else {
      sslOptions = { rejectUnauthorized: true };
      console.log('🔐 Using default SSL (no CA file found)');
    }
  }

  if (process.env.DATABASE_URL) {
    const dbUrl = new URL(process.env.DATABASE_URL);
    pool = mysql.createPool({
      host: dbUrl.hostname,
      port: dbUrl.port ? Number(dbUrl.port) : 3306,
      user: decodeURIComponent(dbUrl.username),
      password: decodeURIComponent(dbUrl.password),
      database: dbUrl.pathname.replace('/', ''),
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 15),
      ssl: sslOptions,
    });
  } else {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'pulse_new',
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 15),
      ssl: sslOptions,
    });
  }
} catch (err) {
  console.error('❌ Error creating DB pool:', err);
  process.exit(1);
}

// Test connection
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL connected to Aiven successfully!');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Failed to connect to Aiven MySQL:', err.message);
    process.exit(1);
  });

// ---------- Health check ----------
app.get('/healthz', (_, res) => res.send('ok'));

app.get('/checkrole', async (req, res) => {
  try {
    const { territory } = req.query;

    if (!territory) {
      return res.status(400).json({ error: "territory is required" });
    }

    const [rows] = await pool.query(
      `SELECT Role FROM organogram WHERE Territory = ? LIMIT 1`,
      [territory]
    );

    if (rows.length === 0) {
      return res.json({ role: null });
    }

    const role = rows[0].Role;

    const allowedRoles = ['BE', 'KAE', 'TE', 'NE'];
    if (allowedRoles.includes(role)) {
      return res.json({ role: "BE" });
    }

    return res.json({ role });

  } catch (err) {
    console.error("Error /checkrole:", err);
    res.status(500).send("Server Error");
  }
});


// ---------- Helper: computeAggregates ----------
app.post("/hierarchy", async (req, res) => {
  try {
    let { territory, period, division } = req.body || {};

    if (!period) {
      return res.status(400).json({ error: "Period (YYYY-MM) is required" });
    }

    // Load only selected month
    const [rows] = await pool.query(
      "SELECT * FROM hierarchy_metrics_agg_ps WHERE period = ?",
      [period]
    );

    if (!rows.length) {
      return res.json({ message: "No data found for selected period" });
    }

    // Parse JSON safely
    for (const r of rows) {
      try {
        r.sales_by_product =
          typeof r.sales_by_product === "string"
            ? JSON.parse(r.sales_by_product)
            : r.sales_by_product || {};
      } catch {
        r.sales_by_product = {};
      }
    }

    // -------------------------------------------------------------
    // ⭐ STEP 1: FIND FULL SUBTREE UNDER LOGGED-IN TERRITORY
    // -------------------------------------------------------------
    function getAllDescendants(startTerritory) {
      const result = new Set();
      const queue = [startTerritory];

      while (queue.length > 0) {
        const terr = queue.shift();
        result.add(terr);

        const children = rows.filter(
          r =>
            r.Area_Name &&
            r.Area_Name.trim().toLowerCase() === terr.trim().toLowerCase()
        );

        children.forEach(ch => queue.push(ch.Territory));
      }

      return result;
    }

    const subtreeTerritories = territory
      ? getAllDescendants(territory)
      : rows.map(r => r.Territory); // For SBUH or admin


    // -------------------------------------------------------------
    // ⭐ STEP 2: Collect all BE-level divisions for UI (no filter)
    // -------------------------------------------------------------
    let divisionsUnderUser = new Set();

    rows.forEach(r => {
      if (!subtreeTerritories.has(r.Territory)) return;

      const hasChild = rows.some(
        x =>
          x.Area_Name &&
          x.Area_Name.trim().toLowerCase() === r.Territory.trim().toLowerCase()
      );

      if (!hasChild && r.Division) {
        divisionsUnderUser.add(r.Division.trim());
      }
    });


    // -------------------------------------------------------------
    // ⭐ STEP 3: BE-LEVEL FILTER BASED ON DIVISION
    // -------------------------------------------------------------
    let filteredRows = rows.filter(r => {
      if (!subtreeTerritories.has(r.Territory)) return false;

      const hasChild = rows.some(
        x =>
          x.Area_Name &&
          x.Area_Name.trim().toLowerCase() === r.Territory.trim().toLowerCase()
      );

      if (!hasChild && division) {
        return r.Division && r.Division.trim() === division.trim();
      }

      return true;
    });

    // -------------------------------------------------------------
    // ⭐ STEP 4: REMOVE EMPTY PARENTS (no BE remains under them)
    // -------------------------------------------------------------
    function hasAnyValidBE(terr) {
      return filteredRows.some(r => {
        const isChild = r.Area_Name &&
          r.Area_Name.trim().toLowerCase() === terr.trim().toLowerCase();

        return (
          isChild &&
          ( // either it's a BE
            rows.every(x => x.Area_Name !== r.Territory) &&
            (!division || r.Division === division)
          )
        );
      });
    }

    function hasValidSubtree(terr) {
      // If BE-level and belongs to correct division → valid
      const r = filteredRows.find(x => x.Territory === terr);
      if (!r) return false;

      const isBE =
        !rows.some(
          x =>
            x.Area_Name &&
            x.Area_Name.trim().toLowerCase() === r.Territory.trim().toLowerCase()
        );

      if (isBE) return true;

      // Check children recursively
      const children = filteredRows.filter(
        x =>
          x.Area_Name &&
          x.Area_Name.trim().toLowerCase() === terr.trim().toLowerCase()
      );

      return children.some(c => hasValidSubtree(c.Territory));
    }

    filteredRows = filteredRows.filter(r => hasValidSubtree(r.Territory));


    // -------------------------------------------------------------
    // ⭐ STEP 5: BUILD LOOKUP
    // -------------------------------------------------------------
    const byTerritory = {};
    filteredRows.forEach(r => (byTerritory[r.Territory] = r));


    // -------------------------------------------------------------
    // ⭐ STEP 6: BUILD NODE RECURSIVELY
    // -------------------------------------------------------------
    function buildNode(terr) {
      const emp = byTerritory[terr];
      if (!emp) return null;

      const childRows = filteredRows.filter(
        r =>
          r.Area_Name &&
          r.Area_Name.trim().toLowerCase() === terr.trim().toLowerCase()
      );

      const children = {};
      for (const c of childRows) {
        const childNode = buildNode(c.Territory);
        if (childNode) children[c.Territory] = childNode;
      }

      let node = {
        empName: emp.Emp_Name,
        territory: emp.Territory,
        role: emp.Role,
        children,
        period: emp.period,
        salesByProduct: emp.sales_by_product || {},
        totalSales: parseFloat(emp.total_sales) || 0,
      };

      // ⭐ Roll-up sales
      if (Object.keys(children).length > 0) {
        const agg = { salesByProduct: {}, totalSales: 0 };

        for (const ch of Object.values(children)) {
          for (const [prod, val] of Object.entries(ch.salesByProduct)) {
            agg.salesByProduct[prod] = (agg.salesByProduct[prod] || 0) + val;
          }
          agg.totalSales += ch.totalSales;
        }

        node.salesByProduct = agg.salesByProduct;
        node.totalSales = agg.totalSales;
      }

      return node;
    }

    // -------------------------------------------------------------
    // ⭐ STEP 7: FIND TOP NODES
    // -------------------------------------------------------------
    const childAreas = new Set(
      filteredRows.map(r => r.Area_Name && r.Area_Name.trim()).filter(Boolean)
    );

    const topLevels = filteredRows.filter(
      r => !childAreas.has(r.Territory.trim())
    );

    // -------------------------------------------------------------
    // ⭐ STEP 8: FINAL HIERARCHY
    // -------------------------------------------------------------
    const hierarchy = {};

    if (territory) {
      const node = buildNode(territory);
      if (node) hierarchy[territory] = node;
    } else {
      for (const top of topLevels) {
        const node = buildNode(top.Territory);
        if (node) hierarchy[top.Territory] = node;
      }
    }

    return res.json({
      hierarchy,
      divisions: Array.from(divisionsUnderUser),
    });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).send("Server error: " + err.message);
  }
});

app.get("/available-periods", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT period FROM hierarchy_metrics_agg_ps ORDER BY period DESC"
    );
    const periods = rows.map(r => r.period);
    res.json({ periods });
  } catch (err) {
    console.error("❌ Error fetching periods:", err);
    res.status(500).send("Server error: " + err.message);
  }
});


// ---------- Employees ----------
app.get('/employees', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT Emp_Name AS name, Role, Emp_Code, Territory 
      FROM organogram
      ORDER BY Emp_Name
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error /employees:', err);
    res.status(500).send("Error");
  }
});

app.get('/get-emp-code', async (req, res) => {
  try {
    const { territory } = req.query;

    if (!territory) {
      return res.status(400).json({ error: "territory is required" });
    }

    // Fetch Emp_Code for the given territory
    const [rows] = await pool.query(
      `SELECT Emp_Code FROM organogram WHERE Territory = ? LIMIT 1`,
      [territory]
    );

    if (rows.length === 0) {
      return res.json({ emp_code: null });
    }

    return res.json({
      emp_code: rows[0].Emp_Code
    });

  } catch (error) {
    console.error("Error fetching Emp_Code:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.post("/getDataByColor", async (req, res) => {
  try {
    const { category, territory, role } = req.body;

    if (!territory || !role) {
      return res
        .status(400)
        .json({ error: "territory and role are required" });
    }

    const roleTerritoryMap = {
      BE: "Territory",
      BM: "BM_Territory",
      BL: "BL_Territory",
      BH: "BH_Territory",
      SBUH: "SBUH_Territory",
    };

    const territoryColumn = roleTerritoryMap[role] || "Territory";

    // 1️⃣ Step: Filter category + territory
    let filterQuery = `
      SELECT *
      FROM deksel_camp
      WHERE ${territoryColumn} = ?
    `;

    const params = [territory];

    if (category && category.trim() !== "") {
      filterQuery += " AND category = ?";
      params.push(category);
    }

    const [filteredRows] = await pool.query(filterQuery, params);

    if (filteredRows.length === 0) {
      return res.json({ success: true, data: [] });
    }
    // 2️⃣ Step: Remove duplicates based on BE HQ from filteredRows
    const uniqueMap = new Map();

    filteredRows.forEach((row) => {
      const hq = row["BE_HQ"];
      if (!uniqueMap.has(hq)) {
        // Keep first row of each BE HQ
        uniqueMap.set(hq, row);
      }
    });

    const uniqueRows = Array.from(uniqueMap.values());

    // 3️⃣ Step: Remove unwanted columns
    const hiddenColumns = [
      "id",
      "Division",
      "SBUH_Territory",
      "BH_Territory",
      "BL_Territory",
      "BM_Territory",
      "Territory",
    ];

    const cleanedRows = uniqueRows.map((row) => {
      hiddenColumns.forEach((col) => delete row[col]);
      return row;
    });

    return res.json({
      success: true,
      data: cleanedRows,
      
    });
  } catch (err) {
    console.error("Error /getDataByColor:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});












// ---------- Graceful shutdown handlers ----------
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});





// ---------- API 2: Table 2 (Pivot Summary View) ----------

app.post('/getTable2', async (req, res) => {
  try {
    const { territory, period } = req.body;

    if (!territory)
      return res.status(400).json({ error: 'territory is required' });

    if (!period)
      return res.status(400).json({ error: 'period (YYYY-MM) is required' });

    // Query by territory + month
    const [rows] = await pool.query(
      `SELECT stockistname, ProductName, Sales 
       FROM sales_data
       WHERE Territory = ?
         AND Period = ?`,
      [territory, period]
    );

    const pivot = {};

    rows.forEach(r => {
      const salesValue = Number(r.Sales) || 0;

      if (!pivot[r.ProductName]) {
        pivot[r.ProductName] = {
          ProductName: r.ProductName,
          GrandTotal: 0
        };
      }

      // aggregate stockist sales
      pivot[r.ProductName][r.stockistname] =
        (pivot[r.ProductName][r.stockistname] || 0) + salesValue;

      pivot[r.ProductName].GrandTotal += salesValue;
    });

    // formatting
    Object.values(pivot).forEach(p => {
      p.GrandTotal = Number(p.GrandTotal.toFixed(2));

      Object.keys(p).forEach(k => {
        if (k !== 'ProductName' && k !== 'GrandTotal') {
          p[k] = Number(p[k].toFixed(2));
        }
      });
    });

    res.json({ results: Object.values(pivot) });
  } catch (err) {
    console.error('Error /getTable2:', err);
    res.status(500).json({ error: 'Database error' });
  }
});




// ---------- Start server ----------
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
