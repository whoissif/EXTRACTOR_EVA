// script.js

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Elementos del DOM
const fileInput = document.getElementById('pdfFile');
const selectFileBtn = document.getElementById('selectFileBtn');
const fileNameSpan = document.getElementById('fileName');
const processBtn = document.getElementById('processBtn');
const exportCSVBtn = document.getElementById('exportCSVBtn');
const exportXLSXBtn = document.getElementById('exportXLSXBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const statsDiv = document.getElementById('stats');
const previewBody = document.getElementById('previewBody');

// Estado de la aplicación
let datosExtraidos = []; // Array de objetos { expediente, dni, unidad, calificacion }

// Evento para seleccionar archivo
selectFileBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        fileNameSpan.textContent = file.name;
        processBtn.disabled = false;
        // Resetear vista previa y datos anteriores
        previewBody.innerHTML = '<tr><td colspan="4" class="placeholder">Archivo cargado. Pulsa "Procesar PDF" para extraer datos.</td></tr>';
        statsDiv.textContent = '';
        exportCSVBtn.disabled = true;
        exportXLSXBtn.disabled = true;
        datosExtraidos = [];
    } else {
        fileNameSpan.textContent = 'Ningún archivo seleccionado';
        processBtn.disabled = true;
    }
});

// Procesar PDF
processBtn.addEventListener('click', procesarPDF);

async function procesarPDF() {
    const file = fileInput.files[0];
    if (!file) return;

    // UI: mostrar progreso
    progressContainer.style.display = 'block';
    progressBar.style.width = '10%';
    processBtn.disabled = true;
    previewBody.innerHTML = '<tr><td colspan="4" class="placeholder">Extrayendo datos, por favor espera...</td></tr>';
    statsDiv.textContent = '';

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let textoCompleto = '';

        progressBar.style.width = '30%';

        // Extraer texto de todas las páginas
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map(item => item.str);
            textoCompleto += strings.join(' ') + '\n';
            // Actualizar progreso según página
            progressBar.style.width = 30 + (i / pdf.numPages) * 40 + '%';
        }

        progressBar.style.width = '70%';

        // 1. Extraer número de expediente
        const expedienteMatch = textoCompleto.match(/Nº\s*EXPEDIENTE\s*([A-Z0-9\/]+)/i);
        if (!expedienteMatch) {
            throw new Error('No se encontró el número de expediente. Verifica que el PDF tenga el formato esperado.');
        }
        const expediente = expedienteMatch[1].trim();

        // 2. Dividir por alumno (la palabra "Alumno:" como separador)
        const bloques = textoCompleto.split(/Alumno:/i);
        // El primer bloque (índice 0) contiene la cabecera, lo ignoramos
        datosExtraidos = [];

        for (let j = 1; j < bloques.length; j++) {
            const bloque = bloques[j];

            // Extraer DNI
            const dniMatch = bloque.match(/DNI:\s*([A-Z0-9]+)/i);
            if (!dniMatch) continue; // Si no hay DNI, no es un bloque válido
            const dni = dniMatch[1].trim();

            // Buscar TODAS las unidades formativas: cualquier UF seguida de dígitos, o MP seguido de dígitos
            // Patrón: (UF\d+|MP\d+)\s*([^UFMP]+?)(?=UF\d+|MP\d+|PROPUESTA|$)
            // Explicación: captura códigos como UF0420, MP0092, luego cualquier texto hasta la próxima unidad o fin.
            const regex = /(UF\d+|MP\d+)\s*([^UFMP]+?)(?=UF\d+|MP\d+|PROPUESTA|$)/gi;
            let match;
            while ((match = regex.exec(bloque)) !== null) {
                let unidad = match[1].trim();
                let calificacion = match[2].trim();
                // Limpiar calificación: eliminar espacios múltiples y recortar
                calificacion = calificacion.replace(/\s+/g, ' ').trim();
                // Validar que la calificación no esté vacía y no sea excesivamente larga (puede haber texto residual)
                if (calificacion && calificacion.length < 100) {
                    datosExtraidos.push({
                        expediente: expediente,
                        dni: dni,
                        unidad: unidad,
                        calificacion: calificacion
                    });
                }
            }
        }

        progressBar.style.width = '100%';
        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
        }, 500);

        // Mostrar resultados
        if (datosExtraidos.length === 0) {
            previewBody.innerHTML = '<tr><td colspan="4" class="placeholder">No se encontraron unidades formativas. Revisa el PDF.</td></tr>';
            statsDiv.textContent = '0 registros encontrados.';
            exportCSVBtn.disabled = true;
            exportXLSXBtn.disabled = true;
        } else {
            // Actualizar estadísticas
            statsDiv.textContent = `Total: ${datosExtraidos.length} registros extraídos.`;
            // Mostrar primeras 20 filas en la tabla
            const filasMostrar = datosExtraidos.slice(0, 20);
            previewBody.innerHTML = '';
            filasMostrar.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.expediente}</td>
                    <td>${item.dni}</td>
                    <td>${item.unidad}</td>
                    <td>${item.calificacion}</td>
                `;
                previewBody.appendChild(row);
            });
            if (datosExtraidos.length > 20) {
                const row = document.createElement('tr');
                row.innerHTML = `<td colspan="4" style="text-align:center; font-style:italic;">... y ${datosExtraidos.length - 20} filas más</td>`;
                previewBody.appendChild(row);
            }
            // Habilitar botones de exportación
            exportCSVBtn.disabled = false;
            exportXLSXBtn.disabled = false;
        }
    } catch (error) {
        console.error(error);
        alert('Error al procesar el PDF: ' + error.message);
        previewBody.innerHTML = '<tr><td colspan="4" class="placeholder">Error durante la extracción. Intenta de nuevo.</td></tr>';
        statsDiv.textContent = '';
        progressContainer.style.display = 'none';
        processBtn.disabled = false;
    }
}

// Exportar a CSV
exportCSVBtn.addEventListener('click', () => {
    if (datosExtraidos.length === 0) return;
    const cabecera = ['Expediente del Curso', 'DNI del alumno', 'Unidad Formativa', 'Calificación'];
    const filas = datosExtraidos.map(d => [d.expediente, d.dni, d.unidad, d.calificacion]);
    const contenido = [cabecera, ...filas]
        .map(fila => fila.map(c => {
            if (typeof c === 'string' && (c.includes(',') || c.includes('"') || c.includes('\n'))) {
                return '"' + c.replace(/"/g, '""') + '"';
            }
            return c;
        }).join(','))
        .join('\n');
    const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'acta_extraida.csv';
    link.click();
});

// Exportar a XLSX
exportXLSXBtn.addEventListener('click', () => {
    if (datosExtraidos.length === 0) return;
    const cabecera = ['Expediente del Curso', 'DNI del alumno', 'Unidad Formativa', 'Calificación'];
    const filas = datosExtraidos.map(d => [d.expediente, d.dni, d.unidad, d.calificacion]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([cabecera, ...filas]);
    XLSX.utils.book_append_sheet(wb, ws, 'Evaluaciones');
    XLSX.writeFile(wb, 'acta_extraida.xlsx');
});