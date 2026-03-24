const fs = require('fs');

const content = fs.readFileSync('src/controllers/authController.ts', 'utf8');

const oldCatch = `  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "Email already registered" });
    } else {
      res.status(500).json({ error: "Server error" });
    }
  }`;

const newCatch = `  } catch (err: any) {
    console.error("Registration error:", err);
    if (err.code === "23505") {
      res.status(409).json({ error: "Email already registered" });
    } else if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
      res.status(503).json({ error: "Database connection failed", details: err.message });
    } else if (err.code === "42P01") {
      res.status(503).json({ error: "Database table not found - run schema.sql", details: err.message });
    } else {
      res.status(500).json({ error: "Server error", details: err.message });
    }
  }`;

// Handle both CRLF and LF line endings
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedOld = oldCatch.replace(/\r\n/g, '\n');
const normalizedNew = newCatch.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedOld)) {
  const updated = normalizedContent.replace(normalizedOld, normalizedNew);
  // Restore original line endings
  const finalContent = content.includes('\r\n') ? updated.replace(/\n/g, '\r\n') : updated;
  fs.writeFileSync('src/controllers/authController.ts', finalContent);
  console.log('Successfully updated authController.ts');
} else {
  console.log('Pattern not found - file may already be updated');
}
