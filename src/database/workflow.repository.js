import { getPool } from "../config/database.js";

export async function createWorkflow(workflow) {
    const pool = getPool();

    const [result] = await pool.query(
        `
        INSERT INTO workflows
        (
            name,
            description,
            stages
        )
        VALUES
        (
            ?,
            ?,
            ?
        )
        `,
        [
            workflow.name,
            workflow.description,
            JSON.stringify(workflow.stages)
        ]
    );

    return result.insertId;
}

export async function getAllWorkflows() {
    const pool = getPool();

    const [rows] = await pool.query(`
        SELECT
            id,
            name,
            description,
            stages,
            is_active,
            created_at,
            updated_at
        FROM workflows
        ORDER BY id
    `);

    return rows.map(workflow => ({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        stages: workflow.stages,
        isActive: Boolean(workflow.is_active),
        createdAt: workflow.created_at,
        updatedAt: workflow.updated_at
    }));
}