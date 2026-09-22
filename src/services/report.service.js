import XLSX from "xlsx";

import {
    getRunsForReport,
    getCurrentStockForReport
} from "../database/report.repository.js";

import {
    REPORT_CONFIG
} from "../config/report.config.js";

function parseDateInput(value, fieldName) {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        throw new Error(
            `${fieldName} must be in YYYY-MM-DD format`
        );
    }

    const date = new Date(
        `${value}T00:00:00`
    );

    if (Number.isNaN(date.getTime())) {
        throw new Error(
            `${fieldName} is invalid`
        );
    }

    const [year, month, day] =
        value.split("-").map(Number);

    if (
        date.getFullYear() !== year ||
        date.getMonth() + 1 !== month ||
        date.getDate() !== day
    ) {
        throw new Error(
            `${fieldName} is invalid`
        );
    }

    return date;
}

function getTodayDateString() {
    const now = new Date();

    const year =
        now.getFullYear();

    const month =
        String(
            now.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            now.getDate()
        ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function validateDateRange(
    startDate,
    endDate,
    maxDays
) {
    const start =
        parseDateInput(
            startDate,
            "start_date"
        );

    const end =
        parseDateInput(
            endDate,
            "end_date"
        );

    if (start > end) {
        throw new Error(
            "Start date cannot be after end date"
        );
    }

    const today =
        parseDateInput(
            getTodayDateString(),
            "today"
        );

    if (end > today) {
        throw new Error(
            "End date cannot be in the future"
        );
    }

    const differenceInDays =
        Math.floor(
            (
                end.getTime() -
                start.getTime()
            ) /
                (1000 * 60 * 60 * 24)
        ) + 1;

    if (
        differenceInDays >
        maxDays
    ) {
        throw new Error(
            `Report date range cannot exceed ${maxDays} days`
        );
    }

    return {
        startDate,
        endDate
    };
}

function parseStageData(stageData) {
    if (
        typeof stageData === "object" &&
        stageData !== null
    ) {
        return stageData;
    }

    if (
        typeof stageData === "string"
    ) {
        try {
            return JSON.parse(
                stageData
            );
        } catch {
            throw new Error(
                "Invalid stage data in workflow run"
            );
        }
    }

    throw new Error(
        "Invalid stage data in workflow run"
    );
}

function getStageQuantityData(
    stageData,
    fieldConfig
) {
    if (
        !fieldConfig ||
        stageData === null ||
        stageData === undefined
    ) {
        return {
            type: "none",
            skuQuantities: new Map(),
            pcQuantity: null
        };
    }

    const data =
        parseStageData(
            stageData
        );

    const items =
        data[
            fieldConfig.itemsField
        ];

    if (Array.isArray(items)) {
        const skuQuantities =
            new Map();

        for (const item of items) {
            if (
                !item ||
                typeof item !== "object"
            ) {
                continue;
            }

            const sku =
                item[
                    fieldConfig.skuField
                ];

            const quantity =
                Number(
                    item[
                        fieldConfig.quantityField
                    ]
                );

            if (
                sku === undefined ||
                sku === null ||
                sku === ""
            ) {
                continue;
            }

            if (
                !Number.isFinite(
                    quantity
                )
            ) {
                continue;
            }

            const skuKey =
                String(sku);

            const existing =
                skuQuantities.get(
                    skuKey
                ) || 0;

            skuQuantities.set(
                skuKey,
                existing + quantity
            );
        }

        return {
            type: "sku",
            skuQuantities,
            pcQuantity: null
        };
    }

    const pcwiseField =
        fieldConfig.pcwiseField ||
        "pcwise";

    const pcQuantity =
        Number(
            data[
                pcwiseField
            ]
        );

    if (
        Number.isFinite(
            pcQuantity
        ) &&
        data[
            pcwiseField
        ] !== null &&
        data[
            pcwiseField
        ] !== undefined &&
        data[
            pcwiseField
        ] !== ""
    ) {
        return {
            type: "pc",
            skuQuantities: new Map(),
            pcQuantity
        };
    }

    return {
        type: "none",
        skuQuantities: new Map(),
        pcQuantity: null
    };
}

function formatPcQuantity(
    quantity
) {
    return `pc:${quantity}`;
}

function getMovementType(
    run,
    config
) {
    const movementTypeConfig =
        config.movementType;

    if (!movementTypeConfig) {
        return "";
    }

    if (
        movementTypeConfig.type ===
        "static"
    ) {
        return movementTypeConfig.value;
    }

    if (
        movementTypeConfig.type ===
        "field"
    ) {
        if (
            !run.initial_stage_data
        ) {
            return "";
        }

        const data =
            parseStageData(
                run.initial_stage_data
            );

        const value =
            data[
                movementTypeConfig.field
            ];

        if (
            value === null ||
            value === undefined
        ) {
            return "";
        }

        return String(value);
    }

    return "";
}

function createReportRow(
    run,
    movementType,
    skuId,
    initialQuantity,
    finalQuantity
) {
    const workflowReference =
        run.reference_name
            ? `${run.workflow_name}-${run.reference_name}`
            : run.workflow_name;

    return {
        "Reference ID":
            run.reference_id,

        "Workflow":
            workflowReference,

        "Initiated Movement Type":
            movementType,

        "SKU ID":
            skuId,

        "Initial Quantity":
            initialQuantity,

        "Final Quantity":
            finalQuantity
    };
}

function buildRowsForSkuToSku(
    run,
    initialData,
    finalData,
    movementType
) {
    const skuSet =
        new Set([
            ...initialData.skuQuantities.keys(),
            ...finalData.skuQuantities.keys()
        ]);

    return Array.from(
        skuSet
    ).map(
        (skuId) =>
            createReportRow(
                run,
                movementType,
                skuId,
                initialData.skuQuantities.get(
                    skuId
                ) || 0,
                finalData.skuQuantities.get(
                    skuId
                ) || 0
            )
    );
}

function buildRowsForPcToPc(
    run,
    initialData,
    finalData,
    movementType
) {
    return [
        createReportRow(
            run,
            movementType,
            "",
            formatPcQuantity(
                initialData.pcQuantity
            ),
            formatPcQuantity(
                finalData.pcQuantity
            )
        )
    ];
}

function buildRowsForPcToSku(
    run,
    initialData,
    finalData,
    movementType
) {
    return Array.from(
        finalData.skuQuantities.entries()
    ).map(
        ([skuId, quantity]) =>
            createReportRow(
                run,
                movementType,
                skuId,
                formatPcQuantity(
                    initialData.pcQuantity
                ),
                quantity
            )
    );
}

function buildRowsForSkuToPc(
    run,
    initialData,
    finalData,
    movementType
) {
    return Array.from(
        initialData.skuQuantities.entries()
    ).map(
        ([skuId, quantity]) =>
            createReportRow(
                run,
                movementType,
                skuId,
                quantity,
                formatPcQuantity(
                    finalData.pcQuantity
                )
            )
    );
}

function buildPendingRows(
    run,
    initialData,
    movementType
) {
    if (
        initialData.type ===
        "pc"
    ) {
        return [
            createReportRow(
                run,
                movementType,
                "",
                formatPcQuantity(
                    initialData.pcQuantity
                ),
                "Pending"
            )
        ];
    }

    if (
        initialData.type ===
        "sku"
    ) {
        return Array.from(
            initialData.skuQuantities.entries()
        ).map(
            ([skuId, quantity]) =>
                createReportRow(
                    run,
                    movementType,
                    skuId,
                    quantity,
                    "Pending"
                )
        );
    }

    return [];
}

function buildSingleStageRows(
    run,
    initialData,
    movementType
) {
    if (
        initialData.type ===
        "pc"
    ) {
        return [
            createReportRow(
                run,
                movementType,
                "",
                formatPcQuantity(
                    initialData.pcQuantity
                ),
                ""
            )
        ];
    }

    if (
        initialData.type ===
        "sku"
    ) {
        return Array.from(
            initialData.skuQuantities.entries()
        ).map(
            ([skuId, quantity]) =>
                createReportRow(
                    run,
                    movementType,
                    skuId,
                    quantity,
                    ""
                )
        );
    }

    return [];
}

function buildReportRows(
    runs,
    workflowConfigs
) {
    const reportRows = [];

    for (const run of runs) {
        const config =
            workflowConfigs[
                String(
                    run.workflow_id
                )
            ] ||
            workflowConfigs[
                run.workflow_id
            ];

        if (!config) {
            continue;
        }

        const initialData =
            getStageQuantityData(
                run.initial_stage_data,
                config.initial
            );

        const movementType =
            getMovementType(
                run,
                config
            );

        /*
         * Stock-In and Stock-Out have
         * only one report stage.
         */
        if (
            !config.final
        ) {
            reportRows.push(
                ...buildSingleStageRows(
                    run,
                    initialData,
                    movementType
                )
            );

            continue;
        }

        /*
         * The run has not reached the
         * configured final stage yet.
         */
        if (
            run.final_stage_data ===
            null ||
            run.final_stage_data ===
            undefined
        ) {
            reportRows.push(
                ...buildPendingRows(
                    run,
                    initialData,
                    movementType
                )
            );

            continue;
        }

        const finalData =
            getStageQuantityData(
                run.final_stage_data,
                config.final
            );

        /*
         * SKU -> SKU
         */
        if (
            initialData.type ===
                "sku" &&
            finalData.type ===
                "sku"
        ) {
            reportRows.push(
                ...buildRowsForSkuToSku(
                    run,
                    initialData,
                    finalData,
                    movementType
                )
            );

            continue;
        }

        /*
         * PC -> PC
         */
        if (
            initialData.type ===
                "pc" &&
            finalData.type ===
                "pc"
        ) {
            reportRows.push(
                ...buildRowsForPcToPc(
                    run,
                    initialData,
                    finalData,
                    movementType
                )
            );

            continue;
        }

        /*
         * PC -> SKU
         */
        if (
            initialData.type ===
                "pc" &&
            finalData.type ===
                "sku"
        ) {
            reportRows.push(
                ...buildRowsForPcToSku(
                    run,
                    initialData,
                    finalData,
                    movementType
                )
            );

            continue;
        }

        /*
         * SKU -> PC
         */
        if (
            initialData.type ===
                "sku" &&
            finalData.type ===
                "pc"
        ) {
            reportRows.push(
                ...buildRowsForSkuToPc(
                    run,
                    initialData,
                    finalData,
                    movementType
                )
            );
        }
    }

    return reportRows;
}

export async function getReportTypesService() {
    return Object.entries(
        REPORT_CONFIG
    ).map(
        ([key, config]) => ({
            key,
            name: config.name
        })
    );
}

export async function generateInOutReportService({
    startDate,
    endDate
}) {
    const config =
        REPORT_CONFIG[
            "in-out"
        ];

    if (!config) {
        throw new Error(
            "In-Out report configuration not found"
        );
    }

    validateDateRange(
        startDate,
        endDate,
        config.maxDays
    );

    const workflowIds =
        Object.keys(
            config.workflows
        );

    const runs =
        await getRunsForReport({
            startDate,
            endDate,
            workflowIds
        });

    if (runs.length === 0) {
        throw new Error(
            "No records found for the selected timeframe."
        );
    }

    const reportRows =
        buildReportRows(
            runs,
            config.workflows
        );

    if (
        reportRows.length === 0
    ) {
        throw new Error(
            "No records found for the selected timeframe."
        );
    }

    const worksheet =
        XLSX.utils.json_to_sheet(
            reportRows,
            {
                header: [
                    "Reference ID",
                    "Workflow",
                    "Initiated Movement Type",
                    "SKU ID",
                    "Initial Quantity",
                    "Final Quantity"
                ]
            }
        );

    worksheet["!cols"] = [
        {
            wch: 20
        },
        {
            wch: 35
        },
        {
            wch: 28
        },
        {
            wch: 20
        },
        {
            wch: 20
        },
        {
            wch: 20
        }
    ];

    const workbook =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "In-Out Report"
    );

    const buffer =
        XLSX.write(
            workbook,
            {
                type: "buffer",
                bookType: "xlsx"
            }
        );

    return {
        buffer,
        filename:
            `in-out-report_${startDate}_to_${endDate}.xlsx`
    };
}

export async function generateStockReportService() {
    const stockRows =
        await getCurrentStockForReport();

    if (stockRows.length === 0) {
        throw new Error(
            "No stock records found."
        );
    }

    const totalQuantity =
        stockRows.reduce(
            (total, row) =>
                total +
                Number(row.quantity),
            0
        );

    const skuTotals = new Map();

    const godownTotals = new Map();

    const locationTotals = new Map();

    for (const row of stockRows) {
        const quantity =
            Number(row.quantity);

        const sku =
            String(row.sku);

        const godown =
            String(row.godown);

        const locationKey =
            `${godown} - ${String(row.rack)}`;

        skuTotals.set(
            sku,
            (skuTotals.get(sku) || 0) +
                quantity
        );

        godownTotals.set(
            godown,
            (godownTotals.get(godown) || 0) +
                quantity
        );

        locationTotals.set(
            locationKey,
            (locationTotals.get(
                locationKey
            ) || 0) + quantity
        );
    }

    const summaryRows = [
        {
            Metric: "Total SKUs",
            Value: skuTotals.size
        },
        {
            Metric: "Total Stock Quantity",
            Value: totalQuantity
        },
        {
            Metric: "Total Godowns",
            Value: godownTotals.size
        },
        {
            Metric: "Total Locations",
            Value: locationTotals.size
        }
    ];

    const skuRows =
        Array.from(
            skuTotals.entries()
        ).map(
            ([sku, quantity]) => ({
                "SKU": sku,
                "Total Quantity":
                    quantity
            })
        );

    const godownRows =
        Array.from(
            godownTotals.entries()
        ).map(
            ([godown, quantity]) => ({
                "Godown": godown,
                "Total Quantity":
                    quantity
            })
        );

    const locationRows =
        Array.from(
            locationTotals.entries()
        ).map(
            ([location, quantity]) => ({
                "Location": location,
                "Total Quantity":
                    quantity
            })
        );

    const detailRows =
        stockRows.map(
            (row) => ({
                "SKU":
                    row.sku,
                "Godown":
                    row.godown,
                "Rack":
                    row.rack,
                "Quantity":
                    Number(row.quantity)
            })
        );

    const workbook =
        XLSX.utils.book_new();

    const summarySheet =
        XLSX.utils.json_to_sheet(
            summaryRows
        );

    const skuSheet =
        XLSX.utils.json_to_sheet(
            skuRows
        );

    const godownSheet =
        XLSX.utils.json_to_sheet(
            godownRows
        );

    const locationSheet =
        XLSX.utils.json_to_sheet(
            locationRows
        );

    const detailSheet =
        XLSX.utils.json_to_sheet(
            detailRows
        );

    summarySheet["!cols"] = [
        {
            wch: 25
        },
        {
            wch: 20
        }
    ];

    skuSheet["!cols"] = [
        {
            wch: 25
        },
        {
            wch: 20
        }
    ];

    godownSheet["!cols"] = [
        {
            wch: 25
        },
        {
            wch: 20
        }
    ];

    locationSheet["!cols"] = [
        {
            wch: 35
        },
        {
            wch: 20
        }
    ];

    detailSheet["!cols"] = [
        {
            wch: 25
        },
        {
            wch: 25
        },
        {
            wch: 25
        },
        {
            wch: 20
        }
    ];

    XLSX.utils.book_append_sheet(
        workbook,
        summarySheet,
        "Summary"
    );

    XLSX.utils.book_append_sheet(
        workbook,
        skuSheet,
        "By SKU"
    );

    XLSX.utils.book_append_sheet(
        workbook,
        godownSheet,
        "By Godown"
    );

    XLSX.utils.book_append_sheet(
        workbook,
        locationSheet,
        "By Location"
    );

    XLSX.utils.book_append_sheet(
        workbook,
        detailSheet,
        "Stock Details"
    );

    const buffer =
        XLSX.write(
            workbook,
            {
                type: "buffer",
                bookType: "xlsx"
            }
        );

    return {
        buffer,
        filename:
            `stock-report.xlsx`
    };
}