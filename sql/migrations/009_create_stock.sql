CREATE TABLE stock (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    sku VARCHAR(255) NOT NULL,

    godown_id BIGINT UNSIGNED NOT NULL,

    rack_id BIGINT UNSIGNED NOT NULL,

    quantity DECIMAL(15,2) NOT NULL DEFAULT 0,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_stock_godown
        FOREIGN KEY (godown_id)
        REFERENCES godowns(id),

    CONSTRAINT fk_stock_rack
        FOREIGN KEY (rack_id)
        REFERENCES racks(id),

    CONSTRAINT uq_stock_sku_godown_rack
        UNIQUE (sku, godown_id, rack_id)
);