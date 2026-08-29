import {
    getTableMetadata,
    getAdminTableRows,
    createAdminRow
} from "../database/admin.repository.js";

import {
    ADMIN_TABLES
} from "../config/admin-tables.js";

export async function getAdminTableMetadata(
    req,
    res
) {
    try {
        const { table } = req.params;

        const tableConfig =
            ADMIN_TABLES[table];

        if (!tableConfig) {
            return res.status(404).json({
                success: false,
                message: "Admin table not found"
            });
        }

        const columns =
        await getTableMetadata(
            table,
            tableConfig
        );

        res.json({
            success: true,
            table,
            columns,
            writableFields:
                Object.keys(
                    tableConfig.writableFields || {}
                )
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Failed to load table metadata"
        });
    }
}

export async function getAdminTableData(
    req,
    res
) {
    try {
        const { table } =
            req.params;

        const tableConfig =
            ADMIN_TABLES[table];

        if (!tableConfig) {
            return res.status(404).json({
                success: false,
                message:
                    "Admin table not found"
            });
        }

        const {
            search = ""
        } = req.query;

        const page =
            Math.max(
                Number(req.query.page) ||
                    1,
                1
            );

        const requestedLimit =
            Number(req.query.limit) ||
            20;

        const limit =
            Math.min(
                Math.max(
                    requestedLimit,
                    1
                ),
                100
            );

        const result =
            await getAdminTableRows(
                table,
                search,
                page,
                limit,
                tableConfig
            );

        res.json({
            success: true,
            table,
            data: result.rows,
            pagination:
                result.pagination
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message:
                "Failed to load table data"
        });
    }
}

export async function createAdminTableRow(
    req,
    res
) {
    try {
        const { table } =
            req.params;

        const tableConfig =
            ADMIN_TABLES[table];

        if (!tableConfig) {
            return res.status(404).json({
                success: false,
                message:
                    "Admin table not found"
            });
        }

        const result =
            await createAdminRow(
                table,
                req.body,
                tableConfig
            );

        res.status(201).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error(error);

        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}
