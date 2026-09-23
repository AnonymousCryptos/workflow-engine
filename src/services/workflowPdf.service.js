import PDFDocument from "pdfkit";

import {
    getWorkflowRunForPdf,
    getSkuDetailsForPdf
} from "../database/workflowRun.repository.js";

import { getWorkflowById } from "../database/workflow.repository.js";

import { getPool } from "../config/database.js";


async function fetchImage(imageUrl) {
    if (!imageUrl) {
        return null;
    }

    try {
        const response =
            await fetch(imageUrl);

        if (!response.ok) {
            return null;
        }

        const contentType =
            response.headers.get(
                "content-type"
            ) || "";

        if (!contentType.startsWith("image/")) {
            return null;
        }

        const arrayBuffer =
            await response.arrayBuffer();

        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error(
            `Failed to fetch image: ${imageUrl}`,
            error
        );

        return null;
    }
}


function formatDate(date) {
    if (!date) {
        return "";
    }

    return new Intl.DateTimeFormat(
        "en-IN",
        {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        }
    ).format(new Date(date));
}


function formatValue(
    value,
    field
) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "-";
    }

    if (
        field?.dataType === "datetime" ||
        field?.component === "datetime"
    ) {
        return formatDate(value);
    }

    if (
        field?.dataType === "boolean"
    ) {
        return value ? "Yes" : "No";
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
}


function getFieldColumns(
    fields
) {
    return fields.filter(
        (field) =>
            field &&
            field.key !== "pdf_required" &&
            field.key !== "assigned_users"
    );
}


/*
 * Resolve all lookup labels in batches.
 *
 * One query is performed per lookup master.
 */
async function resolveLookupLabels(
    fields,
    stageData
) {
    const pool = getPool();

    const lookupRequests =
        new Map();

    function collectFields(
        fieldList,
        data
    ) {
        if (!Array.isArray(fieldList)) {
            return;
        }

        for (const field of fieldList) {
            if (!field || !data) {
                continue;
            }

            const value =
                data[field.key];

            if (
                field.lookup?.master &&
                value !== undefined &&
                value !== null &&
                value !== ""
            ) {
                const master =
                    field.lookup.master;

                if (
                    !lookupRequests.has(
                        master
                    )
                ) {
                    lookupRequests.set(
                        master,
                        new Map()
                    );
                }

                const values =
                    lookupRequests.get(
                        master
                    );

                values.set(
                    String(value),
                    value
                );
            }

            if (
                field.dataType === "array" &&
                Array.isArray(value)
            ) {
                for (const row of value) {
                    if (
                        row &&
                        typeof row === "object"
                    ) {
                        collectFields(
                            field.fields || [],
                            row
                        );
                    }
                }
            }
        }
    }

    collectFields(
        fields,
        stageData
    );

    const resolved =
        new Map();

    const masterConfig = {
        sku: {
            table: "sku_details",
            valueColumn: "sku_name",
            labelColumn: "sku_name"
        },

        party: {
            table: "party_details",
            valueColumn: "party_name",
            labelColumn: "party_name"
        },

        user: {
            table: "users",
            valueColumn: "id",
            labelColumn: "name"
        },

        godown: {
            table: "godowns",
            valueColumn: "id",
            labelColumn: "name"
        },

        rack: {
            table: "racks",
            valueColumn: "id",
            labelColumn: "name"
        }
    };

    /*
     * Lookup masters are independent, so
     * resolve them concurrently.
     */
    const lookupPromises =
        Array.from(
            lookupRequests.entries()
        ).map(
            async ([
                master,
                valuesMap
            ]) => {
                const config =
                    masterConfig[master];

                if (!config) {
                    return [];
                }

                const values =
                    Array.from(
                        valuesMap.values()
                    );

                if (
                    values.length === 0
                ) {
                    return [];
                }

                const placeholders =
                    values
                        .map(
                            () => "?"
                        )
                        .join(", ");

                const [rows] =
                    await pool.query(
                        `
                        SELECT
                            ${config.valueColumn} AS value,
                            ${config.labelColumn} AS label
                        FROM ${config.table}
                        WHERE ${config.valueColumn}
                            IN (${placeholders})
                        `,
                        values
                    );

                return rows.map(
                    (row) => ({
                        master,
                        value:
                            row.value,
                        label:
                            row.label
                    })
                );
            }
        );

    const lookupResults =
        await Promise.all(
            lookupPromises
        );

    for (
        const rows of lookupResults
    ) {
        for (const row of rows) {
            resolved.set(
                `${row.master}:${String(row.value)}`,
                row.label
            );
        }
    }

    return resolved;
}


function getDisplayValue(
    value,
    field,
    lookupLabels
) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "-";
    }

    if (
        field.lookup?.master
    ) {
        const resolved =
            lookupLabels.get(
                `${field.lookup.master}:${String(value)}`
            );

        if (resolved !== undefined) {
            return String(resolved);
        }
    }

    return formatValue(
        value,
        field
    );
}


async function collectSkuNames(
    fields,
    stageData
) {
    const skuNames = [];

    function walk(
        fieldList,
        data
    ) {
        if (!Array.isArray(fieldList)) {
            return;
        }

        for (const field of fieldList) {
            if (!field || !data) {
                continue;
            }

            const value =
                data[field.key];

            if (
                field.key === "sku" &&
                value !== undefined &&
                value !== null &&
                value !== ""
            ) {
                skuNames.push(
                    String(value)
                );
            }

            if (
                field.dataType === "array" &&
                Array.isArray(value)
            ) {
                for (const row of value) {
                    if (
                        row &&
                        typeof row === "object"
                    ) {
                        walk(
                            field.fields || [],
                            row
                        );
                    }
                }
            }
        }
    }

    walk(
        fields,
        stageData
    );

    return [
        ...new Set(skuNames)
    ];
}


/*
 * Fetch unique SKU images concurrently
 * with a bounded concurrency limit.
 *
 * Images are still fetched only once
 * per unique SKU.
 */
async function buildSkuImageMap(
    skuMap
) {
    const imageMap =
        new Map();

    const imageRequests = [];

    for (
        const [
            sku,
            skuDetail
        ] of skuMap
    ) {
        if (
            skuDetail?.image_url
        ) {
            imageRequests.push({
                sku,
                imageUrl:
                    skuDetail.image_url
            });
        }
    }

    /*
     * Run more image requests concurrently
     * than before, while still keeping the
     * number bounded.
     */
    const CONCURRENCY = 20;

    for (
        let start = 0;
        start < imageRequests.length;
        start += CONCURRENCY
    ) {
        const batch =
            imageRequests.slice(
                start,
                start + CONCURRENCY
            );

        const results =
            await Promise.all(
                batch.map(
                    async ({
                        sku,
                        imageUrl
                    }) => ({
                        sku,
                        imageBuffer:
                            await fetchImage(
                                imageUrl
                            )
                    })
                )
            );

        for (const result of results) {
            if (
                result.imageBuffer
            ) {
                imageMap.set(
                    String(result.sku),
                    result.imageBuffer
                );
            }
        }
    }

    return imageMap;
}


function drawPageHeader(
    document,
    title,
    subtitle
) {
    document
        .fillColor("#101828")
        .font("Helvetica-Bold")
        .fontSize(19)
        .text(title);

    if (subtitle) {
        document
            .moveDown(0.3)
            .font("Helvetica")
            .fontSize(9)
            .fillColor("#667085")
            .text(subtitle);
    }

    document.moveDown(1);
}


function drawInfoSection(
    document,
    run,
    fields,
    stageData,
    lookupLabels
) {
    const infoFields =
        fields.filter(
            (field) =>
                field.dataType !== "array" &&
                field.key !== "pdf_required" &&
                field.key !== "assigned_users"
        );

    if (infoFields.length === 0) {
        return;
    }

    const leftX =
        document.page.margins.left;

    const rightX =
        document.page.width -
        document.page.margins.right;

    const width =
        rightX - leftX;

    const columns = 2;

    const columnGap = 20;

    const columnWidth =
        (width - columnGap) /
        columns;

    const rowHeight = 38;

    const rows =
        Math.ceil(
            infoFields.length /
                columns
        );

    const height =
        Math.max(
            70,
            rows * rowHeight + 20
        );

    const startY =
        document.y;

    document
        .roundedRect(
            leftX,
            startY,
            width,
            height,
            6
        )
        .fillColor("#f8fafc")
        .fill();

    document
        .roundedRect(
            leftX,
            startY,
            width,
            height,
            6
        )
        .lineWidth(0.7)
        .strokeColor("#e4e7ec")
        .stroke();

    infoFields.forEach(
        (field, index) => {
            const column =
                index % columns;

            const row =
                Math.floor(
                    index / columns
                );

            const x =
                leftX +
                column *
                    (columnWidth +
                        columnGap) +
                14;

            const y =
                startY +
                12 +
                row * rowHeight;

            const value =
                getDisplayValue(
                    stageData[field.key],
                    field,
                    lookupLabels
                );

            document
                .font("Helvetica-Bold")
                .fontSize(8)
                .fillColor("#667085")
                .text(
                    field.label,
                    x,
                    y,
                    {
                        width:
                            columnWidth -
                            28
                    }
                );

            document
                .font("Helvetica")
                .fontSize(9)
                .fillColor("#101828")
                .text(
                    value,
                    x,
                    y + 12,
                    {
                        width:
                            columnWidth -
                            28
                    }
                );
        }
    );

    document.y =
        startY +
        height +
        20;

    const metadataY =
        document.y;

    document
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#667085")
        .text(
            "Reference ID",
            leftX,
            metadataY
        );

    document
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#101828")
        .text(
            run.referenceId || "-",
            leftX,
            metadataY + 12
        );

    document
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#667085")
        .text(
            "Created On",
            leftX +
                columnWidth +
                columnGap,
            metadataY
        );

    document
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#101828")
        .text(
            formatDate(
                run.createdAt
            ),
            leftX +
                columnWidth +
                columnGap,
            metadataY + 12
        );

    document.y =
        metadataY + 34;
}


function drawTableHeader(
    document,
    columns,
    x,
    y,
    widths
) {
    const totalWidth =
        widths.reduce(
            (sum, width) =>
                sum + width,
            0
        );

    const headerHeight = 30;

    document
        .rect(
            x,
            y,
            totalWidth,
            headerHeight
        )
        .fillColor("#344054")
        .fill();

    let currentX = x;

    document
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(8);

    columns.forEach(
        (column, index) => {
            document.text(
                column.label.toUpperCase(),
                currentX + 8,
                y + 10,
                {
                    width:
                        widths[index] - 16
                }
            );

            currentX +=
                widths[index];
        }
    );

    return y + headerHeight;
}


async function drawArrayTable(
    document,
    field,
    rows,
    lookupLabels,
    skuMap,
    skuImageMap
) {
    if (
        !Array.isArray(rows) ||
        rows.length === 0
    ) {
        return;
    }

    const columns =
        getFieldColumns(
            field.fields || []
        );

    if (columns.length === 0) {
        return;
    }

    const tableX =
        document.page.margins.left;

    const tableWidth =
        document.page.width -
        document.page.margins.left -
        document.page.margins.right;

    const skuColumnIndex =
        columns.findIndex(
            (column) =>
                column.key === "sku"
        );

    const hasSkuColumn =
        skuColumnIndex !== -1;

    const tableColumns = [
        ...columns
    ];

    if (hasSkuColumn) {
        tableColumns.splice(
            skuColumnIndex + 1,
            0,
            {
                key: "__sku_image",
                label: "Image",
                dataType: "image"
            }
        );
    }

    const fixedWidths =
        tableColumns.map(
            (column) => {
                if (
                    column.key === "__sku_image"
                ) {
                    return 140;
                }

                if (
                    column.key === "sku"
                ) {
                    return 110;
                }

                if (
                    column.dataType === "number"
                ) {
                    return 65;
                }

                if (
                    column.key === "godown" ||
                    column.key === "rack"
                ) {
                    return 90;
                }

                return null;
            }
        );

    const fixedTotal =
        fixedWidths.reduce(
            (sum, width) =>
                sum +
                (width || 0),
            0
        );

    const flexibleCount =
        fixedWidths.filter(
            (width) =>
                width === null
        ).length;

    let widths;

    if (flexibleCount > 0) {
        const flexibleWidth =
            Math.max(
                70,
                (tableWidth -
                    fixedTotal) /
                    flexibleCount
            );

        widths =
            fixedWidths.map(
                (width) =>
                    width === null
                        ? flexibleWidth
                        : width
            );
    } else {
        widths =
            fixedWidths.map(
                (width) =>
                    width
            );
    }

    const actualTotal =
        widths.reduce(
            (sum, width) =>
                sum + width,
            0
        );

    const scale =
        actualTotal > 0
            ? tableWidth / actualTotal
            : 1;

    const finalWidths =
        widths.map(
            (width) =>
                width * scale
        );

    const finalTableWidth =
        finalWidths.reduce(
            (sum, width) =>
                sum + width,
            0
        );

    const rowHeight = 60;

    let y =
        document.y;

    document
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#101828")
        .text(field.label);

    document.moveDown(0.5);

    y = document.y;

    function drawHeader() {
        y =
            drawTableHeader(
                document,
                tableColumns,
                tableX,
                y,
                finalWidths
            );
    }

    drawHeader();

    /*
     * Draw table column separators for
     * each page rather than drawing a
     * complete rectangle around every cell.
     */
    function drawColumnSeparators(
        startY,
        endY
    ) {
        let currentX =
            tableX;

        document
            .lineWidth(0.5)
            .strokeColor("#d0d5dd");

        for (
            let index = 0;
            index <
            finalWidths.length - 1;
            index++
        ) {
            currentX +=
                finalWidths[index];

            document
                .moveTo(
                    currentX,
                    startY
                )
                .lineTo(
                    currentX,
                    endY
                )
                .stroke();
        }
    }

    let pageRowsStartY = y;

    for (
        let rowIndex = 0;
        rowIndex < rows.length;
        rowIndex++
    ) {
        const row =
            rows[rowIndex];

        if (
            y + rowHeight >
            document.page.height -
                document.page.margins.bottom
        ) {
            /*
             * Finish the vertical separators
             * on the previous page.
             */
            drawColumnSeparators(
                pageRowsStartY,
                y
            );

            document.addPage();

            y =
                document.page.margins.top;

            drawPageHeader(
                document,
                field.label,
                ""
            );

            y =
                document.y;

            drawHeader();

            pageRowsStartY = y;
        }

        /*
         * Alternate row shades.
         *
         * The darker shade is deliberately
         * visible enough to distinguish rows
         * while remaining print-friendly.
         */
        const background =
            rowIndex % 2 === 0
                ? "#ffffff"
                : "#f2f4f7";

        document
            .rect(
                tableX,
                y,
                finalTableWidth,
                rowHeight
            )
            .fillColor(background)
            .fill();

        let currentX =
            tableX;

        for (
            let columnIndex = 0;
            columnIndex <
            tableColumns.length;
            columnIndex++
        ) {
            const column =
                tableColumns[
                    columnIndex
                ];

            const width =
                finalWidths[
                    columnIndex
                ];

            if (
                column.key ===
                "__sku_image"
            ) {
                const skuValue =
                    row.sku;

                const imageBuffer =
                    skuImageMap?.get(
                        String(skuValue)
                    );

                if (imageBuffer) {
                    const imageX =
                        currentX + 7;

                    const imageY =
                        y + 7;

                    const imageWidth =
                        width - 14;

                    const imageHeight =
                        rowHeight - 14;

                    document.image(
                        imageBuffer,
                        imageX,
                        imageY,
                        {
                            fit: [
                                imageWidth,
                                imageHeight
                            ],
                            align: "center",
                            valign: "center"
                        }
                    );

                    const imageUrl =
                        skuMap?.get(
                            String(skuValue)
                        )?.image_url;

                    if (imageUrl) {
                        document.link(
                            imageX,
                            imageY,
                            imageWidth,
                            imageHeight,
                            imageUrl
                        );
                    }
                }
            }
            else {
                const value =
                    row[
                        column.key
                    ];

                const displayValue =
                    getDisplayValue(
                        value,
                        column,
                        lookupLabels
                    );

                document
                    .font("Helvetica")
                    .fontSize(8)
                    .fillColor("#101828")
                    .text(
                        displayValue,
                        currentX + 7,
                        y + 12,
                        {
                            width:
                                width - 14,
                            height:
                                rowHeight - 18
                        }
                    );
            }

            currentX +=
                width;
        }

        /*
         * Only one horizontal border per row.
         * The vertical borders are drawn once
         * for the page after its rows are rendered.
         */
        document
            .moveTo(
                tableX,
                y + rowHeight
            )
            .lineTo(
                tableX +
                    finalTableWidth,
                y + rowHeight
            )
            .lineWidth(0.5)
            .strokeColor("#d0d5dd")
            .stroke();

        y += rowHeight;
    }

    /*
     * Draw the remaining vertical
     * separators for the final page.
     */
    drawColumnSeparators(
        pageRowsStartY,
        y
    );

    document.y =
        y + 20;
}


export async function generateWorkflowPdf(
    workflowRunId,
    stageId
) {
    const run =
        await getWorkflowRunForPdf(
            workflowRunId,
            stageId
        );

    if (!run) {
        throw new Error(
            "Workflow run or stage history not found"
        );
    }

    let stageData =
        run.stageData;

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
            throw new Error(
                "Stage data is invalid"
            );
        }
    }

    if (
        !stageData ||
        typeof stageData !==
            "object" ||
        Array.isArray(stageData)
    ) {
        throw new Error(
            "Stage data is invalid"
        );
    }

    const workflow =
        await getWorkflowById(
            run.workflowId
        );

    if (!workflow) {
        throw new Error(
            "Workflow not found"
        );
    }

    const stage =
        workflow.stages?.find(
            (item) =>
                Number(item.id) ===
                Number(stageId)
        );

    if (!stage) {
        throw new Error(
            "Workflow stage not found"
        );
    }

    const pdfField =
        stage.fields?.find(
            (field) =>
                field.key ===
                "pdf_required"
        );

    if (
        !pdfField ||
        pdfField.dataType !==
            "boolean"
    ) {
        throw new Error(
            `PDF generation is not configured for stage "${stage.name}"`
        );
    }

    if (
        stageData.pdf_required !==
        true
    ) {
        throw new Error(
            "PDF generation was not requested for this stage"
        );
    }

    const lookupLabels =
        await resolveLookupLabels(
            stage.fields || [],
            stageData
        );

    const skuNames =
        await collectSkuNames(
            stage.fields || [],
            stageData
        );

    let skuMap =
        new Map();

    if (skuNames.length > 0) {
        const skuDetails =
            await getSkuDetailsForPdf(
                skuNames
            );

        skuMap =
            new Map(
                skuDetails.map(
                    (sku) => [
                        sku.sku_name,
                        sku
                    ]
                )
            );
    }

    const skuImageMap =
        await buildSkuImageMap(
            skuMap
        );

    const document =
        new PDFDocument({
            size: "A4",
            margin: 45
        });

    const chunks = [];

    document.on(
        "data",
        (chunk) => {
            chunks.push(chunk);
        }
    );

    const pdfBufferPromise =
        new Promise(
            (resolve, reject) => {
                document.on(
                    "end",
                    () => {
                        resolve(
                            Buffer.concat(
                                chunks
                            )
                        );
                    }
                );

                document.on(
                    "error",
                    reject
                );
            }
        );

    drawPageHeader(
        document,
        stage.name,
        workflow.name
    );

    drawInfoSection(
        document,
        run,
        stage.fields || [],
        stageData,
        lookupLabels
    );

    const arrayFields =
        (stage.fields || []).filter(
            (field) =>
                field &&
                field.dataType ===
                    "array" &&
                field.key !==
                    "assigned_users"
        );

    for (
        const field of arrayFields
    ) {
        await drawArrayTable(
            document,
            field,
            stageData[field.key],
            lookupLabels,
            skuMap,
            skuImageMap
        );
    }

    const footerY =
        document.page.height -
        30;

    document
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#98a2b3")
        .text(
            `Reference ID: ${run.referenceId}`,
            document.page.margins.left,
            footerY,
            {
                width:
                    document.page.width -
                    document.page.margins.left -
                    document.page.margins.right,
                align: "center"
            }
        );

    document.end();

    return await pdfBufferPromise;
}