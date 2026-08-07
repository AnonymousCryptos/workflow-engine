CREATE TABLE workflow_stage_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    workflow_run_id BIGINT UNSIGNED NOT NULL,

    stage_id INT NOT NULL,

    stage_data JSON,

    remark TEXT,

    entered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    completed_at TIMESTAMP NULL,

    CONSTRAINT fk_workflow_stage_history_workflow_run
        FOREIGN KEY (workflow_run_id)
        REFERENCES workflow_runs(id)
);