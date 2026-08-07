CREATE TABLE workflow_runs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    reference_id VARCHAR(100) NOT NULL UNIQUE,

    workflow_id BIGINT UNSIGNED NOT NULL,

    status VARCHAR(30) NOT NULL,

    current_stage_id INT NOT NULL,

    active_stage_data JSON,

    completed_at TIMESTAMP NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_workflow_runs_workflow
        FOREIGN KEY (workflow_id)
        REFERENCES workflows(id)
);