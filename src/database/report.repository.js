import { getPool } from "../config/database.js";

export async function getCompletedRunsForReport({
    startDate,
    endDate,
    workflowIds
}) {
    if (
        !Array.isArray(workflowIds) ||
        workflowIds.length === 0
    ) {
        return [];
    }

    const pool = getPool();

    const placeholders =
        workflowIds
            .map(() => "?")
            .join(", ");

    const [rows] = await pool.query(
        `
        SELECT
            wr.id,
            wr.reference_id,
            wr.workflow_id,
            w.name AS workflow_name,
            wr.created_at,

            first_stage.stage_data
                AS initial_stage_data,

            final_stage.stage_data
                AS final_stage_data

        FROM workflow_runs wr

        INNER JOIN workflows w
            ON w.id = wr.workflow_id

        INNER JOIN workflow_stage_history first_stage
            ON first_stage.id = (
                SELECT MIN(wsh_first.id)
                FROM workflow_stage_history wsh_first
                WHERE wsh_first.workflow_run_id = wr.id
            )

        INNER JOIN workflow_stage_history final_stage
            ON final_stage.id = (
                SELECT MAX(wsh_final.id)
                FROM workflow_stage_history wsh_final
                WHERE wsh_final.workflow_run_id = wr.id
            )

        WHERE wr.status = 'completed'

          AND wr.workflow_id IN (${placeholders})

          AND wr.created_at >= ?

          AND wr.created_at < DATE_ADD(?, INTERVAL 1 DAY)

        ORDER BY
            wr.created_at ASC,
            wr.id ASC
        `,
        [
            ...workflowIds,
            startDate,
            endDate
        ]
    );

    return rows;
}

export async function getCurrentStockForReport() {
    const pool = getPool();

    const [rows] = await pool.query(
        `
        SELECT
            s.sku,
            s.godown_id,
            g.name AS godown,
            s.rack_id,
            r.name AS rack,
            s.quantity
        FROM stock s

        INNER JOIN godowns g
            ON g.id = s.godown_id

        INNER JOIN racks r
            ON r.id = s.rack_id

        WHERE s.quantity > 0

        ORDER BY
            s.quantity DESC,
            s.sku ASC,
            g.name ASC,
            r.name ASC
        `
    );

    return rows;
}
