import XLSX from "xlsx";

import {
    getCompletedRunsForReport,
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

    /*
     * Protect against JavaScript normalizing
     * invalid dates such as 2026-02-31.
     */
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
        typeof stageData ===
        "object" &&
        stageData !== null
    ) {
        return stageData;
    }

    if (
        typeof stageData ===
        "string"
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

function extractSkuQuantities(
    stageData,
    fieldConfig
) {
    const data =
        parseStageData(
            stageData
        );

    const items =
        data[
            fieldConfig.itemsField
        ];

    if (!Array.isArray(items)) {
        return new Map();
    }

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

    return skuQuantities;
}

function buildReportRows(
    runs,
    workflowConfigs
) {
    const reportRows = [];

    for (const run of runs) {
        const config =
            workflowConfigs[
                String(run.workflow_id)
            ] ||
            workflowConfigs[
                run.workflow_id
            ];

        if (!config) {
            continue;
        }

        const initialQuantities =
            extractSkuQuantities(
                run.initial_stage_data,
                config.initial
            );

        const finalQuantities =
            extractSkuQuantities(
                run.final_stage_data,
                config.final
            );

        const skuSet =
            new Set([
                ...initialQuantities.keys(),
                ...finalQuantities.keys()
            ]);

        for (const skuId of skuSet) {
            reportRows.push({
                "Reference ID":
                    run.reference_id,

                "Workflow":
                    run.workflow_name,

                "SKU ID":
                    skuId,

                "Initial Quantity":
                    initialQuantities.get(
                        skuId
                    ) || 0,

                "Final Quantity":
                    finalQuantities.get(
                        skuId
                    ) || 0
            });
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
        await getCompletedRunsForReport({
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

    /*
     * Always create the Excel with
     * the expected columns, even when
     * no completed runs exist.
     */
    const worksheet =
        XLSX.utils.json_to_sheet(
            reportRows,
            {
                header: [
                    "Reference ID",
                    "Workflow",
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
            wch: 30
        },
        {
            wch: 20
        },
        {
            wch: 18
        },
        {
            wch: 18
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
