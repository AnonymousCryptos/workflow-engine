import { getPool } from "../config/database.js";

const MASTER_CONFIG = {
    sku: {
        table: "sku_details",
        labelField: "sku_name",
        valueField: "sku_name"
    },
    party: {
        table: "party_details",
        labelField: "party_name",
        valueField: "party_name"
    },
    user: {
        table: "users",
        labelField: "name",
        valueField: "name"
    }
};

export async function searchMaster(master, search = "", page = 1, limit = 20) {
    const config = MASTER_CONFIG[master];

    if (!config) {
        throw new Error(`Unknown master: ${master}`);
    }
    

    const pool = getPool();

    const offset = (page - 1) * limit;

    const countQuery = `
        SELECT COUNT(*) AS total
        FROM ${config.table}
        WHERE is_active = 1
          AND ${config.labelField} LIKE ?
    `;

    const [countRows] = await pool.query(countQuery, [`%${search}%`]);

    const total = Number(countRows[0].total);

    const query = `
        SELECT
            ${config.valueField} AS value,
            ${config.labelField} AS label
        FROM ${config.table}
        WHERE is_active = 1
          AND ${config.labelField} LIKE ?
        ORDER BY ${config.labelField}
        LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(query, [
        `%${search}%`,
        limit,
        offset
    ]);

    return {
        rows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
}