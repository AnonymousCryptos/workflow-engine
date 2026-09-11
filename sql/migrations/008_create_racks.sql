CREATE TABLE racks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    godown_id BIGINT UNSIGNED NOT NULL,

    name VARCHAR(255) NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_racks_godown
        FOREIGN KEY (godown_id)
        REFERENCES godowns(id),

    CONSTRAINT uq_racks_godown_name
        UNIQUE (godown_id, name)
);