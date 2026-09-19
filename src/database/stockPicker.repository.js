import { getPool } from "../config/database.js";


export async function getStockForPicker({
    skus
}) {
    if (
        !Array.isArray(skus) ||
        skus.length === 0
    ) {
        return [];
    }

    const pool =
        getPool();

    const [rows] =
        await pool.query(
            `
            SELECT
                s.sku,
                s.godown_id,
                g.name AS godown_name,
                s.rack_id,
                r.name AS rack_name,
                s.quantity
            FROM stock s
            INNER JOIN godowns g
                ON g.id = s.godown_id
            INNER JOIN racks r
                ON r.id = s.rack_id
            WHERE s.sku IN (?)
              AND s.quantity > 0
              AND g.is_active = TRUE
              AND r.is_active = TRUE
            ORDER BY
                s.sku ASC,
                s.quantity DESC,
                s.id ASC
            `,
            [skus]
        );

    return rows;
}


export async function getActivePickerSkus({
    skus
}) {
    if (
        !Array.isArray(skus) ||
        skus.length === 0
    ) {
        return [];
    }

    const pool =
        getPool();

    const [rows] =
        await pool.query(
            `
            SELECT
                sku_name
            FROM sku_details
            WHERE sku_name IN (?)
              AND is_active = TRUE
            `,
            [skus]
        );

    return rows;
}