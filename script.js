/*
  © [2024] [SYSMARKETHM]. Todos los derechos reservados.
  Este archivo es parte de [M-Escaner], propiedad de [SYSMARKETHM].
  El uso, distribución o reproducción no autorizados de este material están estrictamente prohibidos.
*/

import { auth, database } from './firebaseConfig.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// Función para mostrar mensajes automáticos
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000); // El mensaje se muestra durante 2 segundos
}

// Función para obtener o generar un ID de dispositivo único
function getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
}

// Función para vincular el ID del dispositivo al usuario en Realtime Database
async function linkDeviceToUser(userId, deviceId) {
    const userRef = ref(database, `users/${userId}`);
    await set(userRef, { deviceId, lastLogin: new Date().toISOString() });
}

// Función para obtener el ID del dispositivo vinculado desde Realtime Database
async function getUserDevice(userId) {
    const userRef = ref(database, `users/${userId}`);
    const snapshot = await get(userRef);
    return snapshot.exists() ? snapshot.val() : null;
}

// Manejar el formulario de inicio de sesión
const loginForm = document.getElementById('loginForm');
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginError = document.getElementById('login-error');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const deviceId = getDeviceId();

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Recuperar el ID del dispositivo vinculado desde Realtime Database
        const userDoc = await getUserDevice(user.uid);

        if (userDoc && userDoc.deviceId) {
            // Si ya existe un dispositivo vinculado
            if (userDoc.deviceId !== deviceId) {
                // Si el dispositivo actual no coincide con el vinculado, denegar acceso
                showToast('Acceso denegado. Esta cuenta está vinculada a otro dispositivo.');
                
                // Cerrar la sesión en este dispositivo
                await auth.signOut();
                return;  // Detener el flujo
            }
        } else {
            // Si es la primera vez que se inicia sesión, vincular el dispositivo
            await linkDeviceToUser(user.uid, deviceId);
        }

        console.log('Usuario autenticado:', user);
        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';
    } catch (error) {
        console.error('Error de autenticación:', error.code, error.message);
        showToast('Error al iniciar sesión. Verifica tu correo y contraseña.');
    }
});

// Manejar el estado de autenticación después del inicio de sesión
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const deviceId = getDeviceId();
        const userDoc = await getUserDevice(user.uid);
        
        if (userDoc && userDoc.deviceId !== deviceId) {
            // Si el dispositivo no coincide, cerrar sesión inmediatamente
            showToast('Acceso denegado. Esta cuenta está vinculada a otro dispositivo.');
            await auth.signOut();
            loginContainer.style.display = 'block';
            appContainer.style.display = 'none';
            return;  // Detener cualquier acceso
        }

        // Si el dispositivo está autorizado, permitir el acceso
        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';
    } else {
        loginContainer.style.display = 'block';
        appContainer.style.display = 'none';
    }
});

// Clase para manejar la base de datos de productos
class ProductDatabase {
    constructor() {
        this.dbName = 'MScannerDB';
        this.dbVersion = 1;
        this.storeName = 'products';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => reject('Error opening database:', event.target.error);

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const store = db.createObjectStore(this.storeName, { keyPath: 'barcode' });
                store.createIndex('description', 'description', { unique: false });
            };
        });
    }

    async addProduct(product) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(product);

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject('Error adding product:', event.target.error);
        });
    }

    async getProduct(barcode) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const request = transaction.objectStore(this.storeName).get(barcode);

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject('Error getting product:', event.target.error);
        });
    }

    async getAllProducts() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const request = transaction.objectStore(this.storeName).getAll();

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject('Error getting all products:', event.target.error);
        });
    }

    async searchProducts(query) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('description');
            const request = index.openCursor();
            const results = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const normalizedDescription = normalizeText(cursor.value.description);
                    const normalizedQuery = normalizeText(query);
                    if (normalizedDescription.includes(normalizedQuery)) {
                        results.push(cursor.value);
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = (event) => reject('Error searching products:', event.target.error);
        });
    }
}

// Función para normalizar texto
function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

// Manejo del escáner de productos y la búsqueda
document.addEventListener('DOMContentLoaded', async () => {
    const db = new ProductDatabase();
    await db.init();

    const barcodeInput = document.getElementById('barcode');
    const descriptionInput = document.getElementById('description');
    const stockInput = document.getElementById('stock');
    const minStockInput = document.getElementById('min-stock');
    const purchasePriceInput = document.getElementById('purchase-price');
    const salePriceInput = document.getElementById('sale-price');
    const productImage = document.getElementById('product-image');
    const scannerContainer = document.getElementById('scanner-container');
    const video = document.getElementById('video');
    const lowStockButton = document.getElementById('low-stock-button');
    const fileInput = document.getElementById('fileInput');
    let productNotFoundAlertShown = false;

    const cache = new Map();
    const scannedBarcodes = new Set(); // Almacenar códigos ya escaneados

    // Implementación de búsqueda difusa con Fuse.js y autocompletado
    descriptionInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        const suggestions = document.getElementById('suggestions');
        suggestions.innerHTML = '';
        suggestions.style.display = 'none';

        if (query === '') return;

        const searchResults = await db.searchProducts(query);

        if (searchResults.length === 0) return;

        suggestions.style.display = 'block';

        searchResults.forEach((product) => {
            const option = document.createElement('div');
            option.textContent = product.description;
            option.classList.add('suggestion-item');
            option.addEventListener('click', () => {
                populateProductFields(product);
                suggestions.innerHTML = '';
                suggestions.style.display = 'none';
            });
            suggestions.appendChild(option);
        });
    });

    function populateProductFields(product) {
        barcodeInput.value = product.barcode || '';
        descriptionInput.value = product.description || '';
        stockInput.value = product.stock || '';
        minStockInput.value = product.minStock || '';
        purchasePriceInput.value = product.purchasePrice || '';
        salePriceInput.value = product.salePrice || '';
        productImage.src = product.imageUrl || '';
        productImage.style.display = product.imageUrl ? 'block' : 'none';
    }

    // Inicializar Quagga
 function initQuagga() {
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: document.querySelector('#scanner-container video'), // Asegúrate de que el video esté dentro del contenedor
                constraints: {
                    width: 640,
                    height: 480,
                    facingMode: "environment"
                },
            },
            decoder: {
                readers: [
                    "ean_reader",
                    "code_128_reader"
                ]
            },
        }, function(err) {
            if (err) {
                console.error("Error al iniciar Quagga:", err);
                showToast("Error al iniciar el escáner de códigos de barras.");
                return;
            }
            console.log("Quagga iniciado correctamente");
            Quagga.start();
        });

        Quagga.onDetected((result) => {
            // ... (código de detección existente)
        });
    } else {
        console.error("getUserMedia no está soportado en este navegador");
        showToast("La cámara no está disponible en este dispositivo.");
    }
}

// Modificar el evento del botón de escaneo
const scanButton = document.getElementById('scan-button');
scanButton.addEventListener('click', () => {
    const scannerContainer = document.getElementById('scanner-container');
    scannerContainer.style.display = 'block';
    console.log("Mostrando el contenedor de la cámara");
    initQuagga(); // Iniciar Quagga
});

// Modificar la función para hacer el contenedor arrastrable
function makeElementDraggable(element) {
    let isDragging = false;
    let startX, startY;

    element.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX - element.offsetLeft;
        startY = e.clientY - element.offsetTop;
        element.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let newX = e.clientX - startX;
        let newY = e.clientY - startY;
        
        // Limitar el movimiento dentro de la ventana
        newX = Math.max(0, Math.min(newX, window.innerWidth - element.offsetWidth));
        newY = Math.max(0, Math.min(newY, window.innerHeight - element.offsetHeight));
        
        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        element.style.cursor = 'grab';
    });
}

// Asegúrate de que esta función se llame cuando el DOM esté cargado
document.addEventListener('DOMContentLoaded', () => {
    const scannerContainer = document.getElementById('scanner-container');
    makeElementDraggable(scannerContainer);
});

    // Iniciar escáner al hacer clic en el botón
    const scanButton = document.getElementById('scan-button');
    scanButton.addEventListener('click', () => {
        scannerContainer.style.display = 'block';
        console.log("Mostrando el contenedor de la cámara");
        initQuagga(); // Iniciar Quagga
    });

    // Detener el escáner
    const stopScannerButton = document.getElementById('stop-scanner');
    stopScannerButton.addEventListener('click', () => {
        scannerContainer.style.display = 'none';
        Quagga.stop(); // Detener el escáner de Quagga
    });

    // Guardar producto
    const saveButton = document.getElementById('save-button');
    saveButton.addEventListener('click', async () => {
        const product = {
            barcode: barcodeInput.value.trim(),
            description: descriptionInput.value.trim(),
            stock: parseFloat(stockInput.value.trim()),
            minStock: parseFloat(minStockInput.value.trim()),
            purchasePrice: parseFloat(purchasePriceInput.value.trim()),
            salePrice: parseFloat(salePriceInput.value.trim()),
            imageUrl: productImage.src
        };

        if (product.barcode === '') {
            showToast('El código de barras es obligatorio.');
            return;
        }

        try {
            await db.addProduct(product);
            showToast('Producto guardado.');
            clearFields();
        } catch (error) {
            console.error('Error al guardar el producto:', error);
            showToast('Error al guardar el producto.');
        }
    });

    // Borrar campos
    const clearButton = document.getElementById('clear-button');
    clearButton.addEventListener('click', () => {
        clearFields();
    });

    function clearFields() {
        barcodeInput.value = '';
        descriptionInput.value = '';
        stockInput.value = '';
        minStockInput.value = '';
        purchasePriceInput.value = '';
        salePriceInput.value = '';
        productImage.src = '';
        productImage.style.display = 'none';
    }

    // Mostrar productos con stock bajo
    if (lowStockButton) {
        lowStockButton.addEventListener('click', async () => {
            const lowStockProducts = await db.getAllProducts();
            const filteredProducts = lowStockProducts.filter(product => product.stock <= product.minStock);

            if (filteredProducts.length === 0) {
                showToast('No hay productos con stock bajo.');
                return;
            }

            // Muestra una lista de productos con stock bajo
            // Implementa el comportamiento para mostrar estos productos en la interfaz
        });
    }

    // Importar productos desde Excel
    if (fileInput) {
        fileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const products = await importProductsFromExcel(file);
                for (const product of products) {
                    await db.addProduct(product);
                }
                showToast('Productos importados con éxito.');
            } catch (error) {
                console.error('Error al importar productos:', error);
                showToast('Error al importar productos.');
            }
        });
    }

    // Exportar productos a Excel
    const exportButton = document.getElementById('export-button');
    exportButton.addEventListener('click', async () => {
        try {
            const allProducts = await db.getAllProducts();
            exportProductsToExcel(allProducts);
        } catch (error) {
            console.error('Error al exportar productos:', error);
            showToast('Error al exportar productos.');
        }
    });

    // Función para importar productos desde Excel
    async function importProductsFromExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const products = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                const importedProducts = [];
                for (let i = 1; i < products.length; i++) { // Comenzar desde 1 para omitir encabezados
                    const row = products[i];
                    const [barcode, description, salePrice, stock] = row;

                    if (barcode && description && !isNaN(salePrice) && !isNaN(stock)) {
                        importedProducts.push({
                            barcode: String(barcode),
                            description: String(description),
                            salePrice: parseFloat(salePrice),
                            stock: parseFloat(stock)
                        });
                    }
                }
                resolve(importedProducts);
            };
            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    }

    // Función para exportar productos a Excel
    function exportProductsToExcel(products) {
        const worksheet = XLSX.utils.json_to_sheet(products);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');
        XLSX.writeFile(workbook, 'productos.xlsx');
    }
});

/* Inicio de la integración de QuaggaJS personalizada */
// Variables para inicialización
let isInitialized = false;
let isScanning = false;
let detectionCounts = {}; // Objeto para llevar el conteo de detecciones por código

const productDatabase = {
  '7501055309474': { name: 'Coca-Cola 600ml', price: '$15.00' },
  '7501000911288': { name: 'Sabritas Original 45g', price: '$12.50' },
  '7501030440818': { name: 'Bimbo Pan Blanco', price: '$35.00' },
  '7501052435626': { name: 'Leche Alpura 1L', price: '$23.50' },
  '7501008042090': { name: 'Galletas Marías Gamesa', price: '$18.00' },
};

function showError(message) {
  const errorElement = document.getElementById('error-message');
  errorElement.textContent = message;
  console.error(message);
}

function updateDebugInfo(message) {
  const debugElement = document.getElementById('debug-info');
  debugElement.textContent += new Date().toLocaleTimeString() + ': ' + message + '\n';
  console.log(message);
}

function initializeScanner() {
  updateDebugInfo('Inicializando escáner...');
  if (typeof Quagga === 'undefined') {
    showError('Error: La biblioteca Quagga no se ha cargado correctamente.');
    return;
  }

  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: document.querySelector("#scanner-container"),
      constraints: {
        width: 800,  // Resolución para mejorar rendimiento
        height: 600, // Resolución para mejorar rendimiento
        facingMode: "environment" // Cámara trasera
      },
    },
    locator: {
      patchSize: "large", // Tamaño de parche grande para mejorar la detección
      halfSample: true // Usa imagen reducida para mejorar el rendimiento
    },
    numOfWorkers: 30, // Incrementar trabajadores para mejorar velocidad
    decoder: {
      readers: [
        "ean_reader",
        "ean_8_reader",
        "upc_reader",
        "code_39_reader",
        "code_128_reader"
      ]
    },
    locate: true, // Habilitar localización automática de códigos
    frequency: 200, // Procesar 70 fotogramas por segundo
  }, function(err) {
    if (err) {
      console.error("Error al iniciar Quagga:", err);
      showError("Error al inicializar el escáner: " + err);
      return;
    }
    updateDebugInfo("Quagga inicializado correctamente");
    isInitialized = true;
  });

  Quagga.onProcessed(function(result) {
    // Aquí solo actualizamos la UI con información de procesamiento
    if (result) {
      updateDebugInfo('Imagen procesada');
    }
  });

  Quagga.onDetected(function(result) {
    let code = result.codeResult.code;
    let type = result.codeResult.format;

    // Inicializar el conteo del código si no existe
    if (!detectionCounts[code]) {
      detectionCounts[code] = 0;
    }
    
    // Incrementar el conteo del código detectado
    detectionCounts[code]++;
    document.getElementById("code").textContent = code;
    document.getElementById("type").textContent = type;
    updateDebugInfo("Código detectado: " + code + " (Tipo: " + type + "), Detecciones totales: " + detectionCounts[code]);

    displayProductInfo(code);

    // Detener después de 5 detecciones del mismo código
    if (detectionCounts[code] >= 5) {
      stopScanner();
      updateDebugInfo("El escaneo se detuvo automáticamente después de 5 detecciones del código: " + code);
      alert("El escáner ha terminado después de 5 detecciones del código: " + code);
    }
  });
}

function startScanner() {
  if (!isInitialized) {
    showError("Por favor, inicializa el escáner primero.");
    return;
  }
  if (isScanning) {
    updateDebugInfo('El escáner ya está en funcionamiento.');
    return;
  }
  updateDebugInfo('Iniciando escaneo...');
  Quagga.start();
  isScanning = true;
}

function stopScanner() {
  if (!isScanning) {
    updateDebugInfo("El escáner no está en funcionamiento.");
    return;
  }
  Quagga.stop();
  isScanning = false;
  updateDebugInfo("Escáner detenido.");
}

function displayProductInfo(code) {
  const productInfoElement = document.getElementById('product-info');
  if (productDatabase[code]) {
    const product = productDatabase[code];
    productInfoElement.innerHTML = `
      <h3>Información del Producto</h3>
      <p><strong>Nombre:</strong> ${product.name}</p>
      <p><strong>Precio:</strong> ${product.price}</p>
    `;
  } else {
    productInfoElement.innerHTML = `
      <h3>Información del Producto</h3>
      <p>No se encontró información para el código ${code}</p>
    `;
  }
}

window.addEventListener('load', function() {
  if (typeof Quagga === 'undefined') {
    showError('La biblioteca Quagga no se ha cargado correctamente. Por favor, verifica tu conexión a internet y recarga la página.');
  } else {
    updateDebugInfo('Página cargada correctamente, Quagga disponible.');
  }
});
/* Fin de la integración de QuaggaJS personalizada */
