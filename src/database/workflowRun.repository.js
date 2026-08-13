import { getPool } from "../config/database.js";

export async function createWorkflowRun({
    referenceId,
    workflowId,
    currentStageId,
    activeStageData,
    stageId,
    stageData,
    remark,
    performedBy,
    completed
}) {
    const pool = getPool();

    const connection =
        await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [runResult] =
            await connection.query(
                `
                INSERT INTO workflow_runs
                (
                    reference_id,
                    workflow_id,
                    status,
                    current_stage_id,
                    active_stage_data,
                    completed_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                `,
                [
                    referenceId,
                    workflowId,
                    completed
                        ? "completed"
                        : "running",
                    currentStageId,
                    JSON.stringify(
                        activeStageData
                    ),
                    completed
                        ? new Date()
                        : null
                ]
            );

        const workflowRunId =
            runResult.insertId;

        await connection.query(
            `
            INSERT INTO workflow_stage_history
            (
                workflow_run_id,
                stage_id,
                stage_data,
                remark,
                performed_by,
                completed_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                workflowRunId,
                stageId,
                JSON.stringify(
                    stageData
                ),
                remark || null,
                performedBy,
                new Date()
            ]
        );

        await connection.commit();

        return workflowRunId;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function submitWorkflowStage({
    workflowRunId,
    nextStageId,
    stageId,
    stageData,
    remark,
    performedBy,
    completed
}) {
    const pool = getPool();

    const connection =
        await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [runRows] =
            await connection.query(
                `
                SELECT
                    id,
                    status,
                    current_stage_id
                FROM workflow_runs
                WHERE id = ?
                FOR UPDATE
                `,
                [workflowRunId]
            );

        if (runRows.length === 0) {
            throw new Error(
                "Workflow run not found"
            );
        }

        const run = runRows[0];

        if (run.status === "completed") {
            throw new Error(
                "Workflow run is already completed"
            );
        }

        if (
            Number(run.current_stage_id) !==
            Number(stageId)
        ) {
            throw new Error(
                "Submitted stage is not the current stage"
            );
        }

        await connection.query(
            `
            INSERT INTO workflow_stage_history
            (
                workflow_run_id,
                stage_id,
                stage_data,
                remark,
                performed_by,
                completed_at
            )
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `,
            [
                workflowRunId,
                stageId,
                JSON.stringify(
                    stageData
                ),
                remark || null,
                performedBy
            ]
        );

        await connection.query(
            `
            UPDATE workflow_runs
            SET
                current_stage_id = ?,
                status = ?,
                completed_at = ?
            WHERE id = ?
            `,
            [
                nextStageId,
                completed
                    ? "completed"
                    : "running",
                completed
                    ? new Date()
                    : null,
                workflowRunId
            ]
        );

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function getWorkflowRunById(
    workflowRunId
) {
    const pool = getPool();

    const [rows] =
        await pool.query(
            `
            SELECT
                id,
                reference_id,
                workflow_id,
                status,
                current_stage_id,
                active_stage_data,
                completed_at,
                created_at,
                updated_at
            FROM workflow_runs
            WHERE id = ?
            LIMIT 1
            `,
            [workflowRunId]
        );

    if (rows.length === 0) {
        return null;
    }

    const run = rows[0];

    return {
        id: run.id,
        referenceId:
            run.reference_id,
        workflowId:
            run.workflow_id,
        status:
            run.status,
        currentStageId:
            run.current_stage_id,
        activeStageData:
            run.active_stage_data,
        completedAt:
            run.completed_at,
        createdAt:
            run.created_at,
        updatedAt:
            run.updated_at
    };
}

export async function getWorkflowRunForPdf(
    workflowRunId
) {
    const pool = getPool();

    const [rows] =
        await pool.query(
            `
            SELECT
                wr.id,
                wr.reference_id,
                wr.workflow_id,
                wr.status,
                wr.created_at,
                wsh.stage_data
            FROM workflow_runs wr
            INNER JOIN workflow_stage_history wsh
                ON wsh.workflow_run_id =
                   wr.id
            WHERE wr.id = ?
            ORDER BY wsh.id ASC
            LIMIT 1
            `,
            [workflowRunId]
        );

    if (rows.length === 0) {
        return null;
    }

    return {
        id: rows[0].id,
        referenceId:
            rows[0].reference_id,
        workflowId:
            rows[0].workflow_id,
        status:
            rows[0].status,
        createdAt:
            rows[0].created_at,
        stageData:
            rows[0].stage_data
    };
}

export async function getSkuDetailsForPdf(
    skuNames
) {
    if (
        !Array.isArray(skuNames) ||
        skuNames.length === 0
    ) {
        return [];
    }

    const pool = getPool();

    const placeholders =
        skuNames
            .map(() => "?")
            .join(", ");

    const [rows] =
        await pool.query(
            `
            SELECT
                sku_name,
                image_url
            FROM sku_details
            WHERE sku_name IN (${placeholders})
              AND is_active = 1
            `,
            skuNames
        );

    return rows;
}

export async function getActiveWorkflowRuns() {
    const pool = getPool();

    const [rows] =
        await pool.query(
            `
            SELECT
                id,
                reference_id,
                workflow_id,
                status,
                current_stage_id,
                active_stage_data,
                completed_at,
                created_at,
                updated_at
            FROM workflow_runs
            WHERE status = 'running'
            ORDER BY updated_at DESC
            `
        );

    return rows.map((run) => ({
        id: run.id,
        referenceId:
            run.reference_id,
        workflowId:
            run.workflow_id,
        status:
            run.status,
        currentStageId:
            run.current_stage_id,
        activeStageData:
            run.active_stage_data,
        completedAt:
            run.completed_at,
        createdAt:
            run.created_at,
        updatedAt:
            run.updated_at
    }));
}

export async function getWorkflowRunHistory({
    page,
    limit
}) {
    const pool = getPool();

    const offset =
        (page - 1) * limit;

    const [countRows] =
        await pool.query(
            `
            SELECT COUNT(*) AS total
            FROM workflow_runs
            `
        );

    const total =
        Number(countRows[0].total);

    const [rows] =
        await pool.query(
            `
            SELECT
                wr.id,
                wr.reference_id,
                wr.workflow_id,
                w.name AS workflow_name,
                JSON_UNQUOTE(
                    JSON_EXTRACT(
                        first_stage.stage_data,
                        '$.reference_name'
                    )
                ) AS reference_name,
                wr.status,
                wr.current_stage_id,
                wr.completed_at,
                wr.created_at,
                wr.updated_at
            FROM workflow_runs wr
            INNER JOIN workflows w
                ON w.id = wr.workflow_id
            LEFT JOIN workflow_stage_history first_stage
                ON first_stage.workflow_run_id =
                   wr.id
                AND first_stage.id = (
                    SELECT MIN(
                        wsh_first.id
                    )
                    FROM workflow_stage_history
                        wsh_first
                    WHERE wsh_first.workflow_run_id =
                        wr.id
                )
            ORDER BY wr.created_at DESC
            LIMIT ? OFFSET ?
            `,
            [limit, offset]
        );

    return {
        rows: rows.map((run) => ({
            id: run.id,
            referenceId:
                run.reference_id,
            referenceName:
                run.reference_name,
            workflowId:
                run.workflow_id,
            workflowName:
                run.workflow_name,
            status:
                run.status,
            currentStageId:
                run.current_stage_id,
            completedAt:
                run.completed_at,
            createdAt:
                run.created_at,
            updatedAt:
                run.updated_at
        })),
        total
    };
}

export async function getWorkflowStageHistory({
    workflowRunId,
    page,
    limit
}) {
    const pool = getPool();

    const offset =
        (page - 1) * limit;

    const [countRows] =
        await pool.query(
            `
            SELECT COUNT(*) AS total
            FROM workflow_stage_history
            WHERE workflow_run_id = ?
            `,
            [workflowRunId]
        );

    const total =
        Number(countRows[0].total);

    const [rows] =
        await pool.query(
            `
            SELECT
                wsh.id,
                wsh.workflow_run_id,
                wsh.stage_id,
                wsh.stage_data,
                wsh.remark,
                wsh.performed_by,
                u.name AS performed_by_name,
                wsh.entered_at,
                wsh.completed_at
            FROM workflow_stage_history wsh
            LEFT JOIN users u
                ON u.id = wsh.performed_by
            WHERE wsh.workflow_run_id = ?
            ORDER BY
                wsh.entered_at ASC,
                wsh.id ASC
            LIMIT ? OFFSET ?
            `,
            [
                workflowRunId,
                limit,
                offset
            ]
        );

    const assignedUserIds =
        new Set();

    rows.forEach((stage) => {
        let stageData =
            stage.stage_data;

        if (
            typeof stageData ===
            "string"
        ) {
            try {
                stageData =
                    JSON.parse(
                        stageData
                    );
            } catch {
                return;
            }
        }

        if (
            Array.isArray(
                stageData?.assigned_users
            )
        ) {
            stageData.assigned_users.forEach(
                (userId) => {
                    assignedUserIds.add(
                        Number(userId)
                    );
                }
            );
        }
    });

    let usersMap =
        new Map();

    if (
        assignedUserIds.size > 0
    ) {
        const [users] =
            await pool.query(
                `
                SELECT
                    id,
                    name
                FROM users
                WHERE id IN (?)
                `,
                [
                    [
                        ...assignedUserIds
                    ]
                ]
            );

        usersMap = new Map(
            users.map((user) => [
                Number(user.id),
                {
                    id: Number(
                        user.id
                    ),
                    name: user.name
                }
            ])
        );
    }

    return {
        rows: rows.map((stage) => {
            let stageData =
                stage.stage_data;

            if (
                typeof stageData ===
                "string"
            ) {
                try {
                    stageData =
                        JSON.parse(
                            stageData
                        );
                } catch {
                    stageData =
                        stage.stage_data;
                }
            }

            if (
                Array.isArray(
                    stageData?.assigned_users
                )
            ) {
                stageData.assigned_users =
                    stageData.assigned_users.map(
                        (userId) =>
                            usersMap.get(
                                Number(userId)
                            ) || {
                                id: Number(
                                    userId
                                ),
                                name: `User ${userId}`
                            }
                    );
            }

            return {
                id: stage.id,

                workflowRunId:
                    stage.workflow_run_id,

                stageId:
                    stage.stage_id,

                stageData,

                remark:
                    stage.remark,

                performedBy:
                    stage.performed_by
                        ? {
                              id:
                                  stage.performed_by,
                              name:
                                  stage.performed_by_name
                          }
                        : null,

                enteredAt:
                    stage.entered_at,

                completedAt:
                    stage.completed_at
            };
        }),

        total
    };
}

export async function getPreviousStageHistory(
    workflowRunId,
    stageId
) {
    const pool = getPool();

    const [rows] =
        await pool.query(
            `
            SELECT
                id,
                workflow_run_id,
                stage_id,
                stage_data
            FROM workflow_stage_history
            WHERE workflow_run_id = ?
              AND stage_id = ?
            ORDER BY id DESC
            LIMIT 1
            `,
            [
                workflowRunId,
                stageId
            ]
        );

    if (rows.length === 0) {
        return null;
    }

    return {
        id: rows[0].id,
        workflowRunId:
            rows[0].workflow_run_id,
        stageId:
            rows[0].stage_id,
        stageData:
            rows[0].stage_data
    };
}