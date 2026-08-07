import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { getPool } from "../config/database.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createMigrationTable() {
    const pool = getPool();

    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

            migration_name VARCHAR(255) NOT NULL UNIQUE,

            executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

async function getMigrationFiles() {
    const migrationDirectory = path.join(__dirname, "../../sql/migrations");

    const files = await fs.readdir(migrationDirectory);

    return files
        .filter(file => file.endsWith(".sql"))
        .sort();
}

async function getExecutedMigrations() {
    const pool = getPool();

    const [rows] = await pool.query(`
        SELECT migration_name
        FROM schema_migrations
    `);

    return new Set(rows.map(row => row.migration_name));
}

async function executeMigration(fileName) {
    const pool = getPool();

    const filePath = path.join(__dirname, "../../sql/migrations", fileName);

    const sql = await fs.readFile(filePath, "utf8");

    console.log(`Running ${fileName}...`);

    await pool.query(sql);

    await pool.query(
        `
        INSERT INTO schema_migrations (migration_name)
        VALUES (?)
        `,
        [fileName]
    );

    console.log(`✓ ${fileName} completed`);
}

async function migrate() {
    try {
        await createMigrationTable();

        const files = await getMigrationFiles();

        const executed = await getExecutedMigrations();

        for (const file of files) {
            if (executed.has(file)) {
                console.log(`Skipping ${file}`);
                continue;
            }

            await executeMigration(file);
        }

        console.log("✓ Database is up to date");
    } catch (error) {
        console.error(error);
        process.exit(1);
    }

    process.exit(0);
}

migrate();