import { getPool } from "../config/database.js";
import { MASTER_CONFIG } from "../config/master-tables.js";

export async function searchMaster(
    master,
    search = "",
    page = 1,
    limit = 20,
    filters = {}
) {
    const config =
        MASTER_CONFIG[master];

    if (!config) {
        throw new Error(
            `Unknown master: ${master}`
        );
    }

    const pool = getPool();

    const offset =
        (page - 1) * limit;

    const conditions = [
        "is_active = 1",
        `${config.labelField} LIKE ?`
    ];

    const queryParams = [
        `%${search}%`
    ];

    if (config.parentField) {
        if (
            filters.godown_id === undefined ||
            filters.godown_id === null ||
            filters.godown_id === ""
        ) {
            throw new Error(
                "godown_id is required for rack lookup"
            );
        }

        conditions.push(
            `${config.parentField} = ?`
        );

        queryParams.push(
            filters.godown_id
        );
    }

    const whereClause =
        conditions.join(" AND ");

    const [countRows] =
        await pool.query(
            `
            SELECT COUNT(*) AS total
            FROM ${config.table}
            WHERE ${whereClause}
            `,
            queryParams
        );

    const total =
        Number(countRows[0].total);

    const [rows] =
        await pool.query(
            `
            SELECT
                ${
                    config.idField
                        ? `${config.idField} AS id,`
                        : ""
                }
                ${config.valueField} AS value,
                ${config.labelField} AS label
            FROM ${config.table}
            WHERE ${whereClause}
            ORDER BY ${config.labelField}
            LIMIT ? OFFSET ?
            `,
            [
                ...queryParams,
                limit,
                offset
            ]
        );

    return {
        rows,
        pagination: {
            page,
            limit,
            total,
            totalPages:
                Math.ceil(
                    total / limit
                )
        }
    };
}