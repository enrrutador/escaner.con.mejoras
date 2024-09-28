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
    let barcodeDetector;
    let productNotFoundAlertShown = false;

    const cache = new Map();

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

    // Inicializar y configurar QuaggaJS
   function initQuagga() {
    Quagga.init({
        inputStream: {
            name: 'Live',
            type: 'LiveStream',
            target: video, // Elemento del video en tu HTML
            constraints: {
                facingMode: 'environment' // Usar la cámara trasera
            }
        },
        decoder: {
            readers: ['ean_reader'] // Tipo de código a leer
        }
    }, (err) => {
        if (err) {
            console.error('Error al iniciar Quagga:', err);
            showToast('No se pudo acceder a la cámara. Revisa los permisos.');
            return;
        }
        Quagga.start();
        console.log("Escáner iniciado correctamente");
    });
}


        // Manejador de detección
        Quagga.onDetected((result) => {
            if (result && result.codeResult && result.codeResult.code) {
                const barcode = result.codeResult.code;
                barcodeInput.value = barcode;

                // Detener el escáner para evitar múltiples lecturas
                Quagga.stop();

                // Buscar producto en la base de datos local
                db.getProduct(barcode).then((product) => {
                    if (product) {
                        populateProductFields(product);
                    } else {
                        showToast('Producto no encontrado.');
                        productNotFoundAlertShown = true;
                    }
                }).catch((error) => {
                    console.error('Error al buscar producto:', error);
                    showToast('Error al buscar producto en la base de datos.');
                });
            }
        });
    }

// Iniciar el escáner
const scanButton = document.getElementById('scan-button');  // Cambiado a 'scan-button'
if (scanButton) {
    scanButton.addEventListener('click', () => {
        scannerContainer.style.display = 'block';
        initQuagga();
    });
} else {
    console.error('Elemento scan-button no encontrado en el DOM.');
}


    // Detener el escáner
    const stopScannerButton = document.getElementById('stop-scanner');
    if (stopScannerButton) {
        stopScannerButton.addEventListener('click', () => {
            scannerContainer.style.display = 'none';
            Quagga.stop();
        });
    } else {
        console.error('Elemento stop-scanner no encontrado en el DOM.');
    }

    // Guardar producto
    const saveButton = document.getElementById('save-button');
    if (saveButton) {
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
    } else {
        console.error('Elemento save-button no encontrado en el DOM.');
    }

    // Borrar campos
    const clearButton = document.getElementById('clear-button');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            clearFields();
        });
    } else {
        console.error('Elemento clear-button no encontrado en el DOM.');
    }

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
    if (exportButton) {
        exportButton.addEventListener('click', async () => {
            try {
                const allProducts = await db.getAllProducts();
                exportProductsToExcel(allProducts);
            } catch (error) {
                console.error('Error al exportar productos:', error);
                showToast('Error al exportar productos.');
            }
        });
    }

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
// Función para hacer que el contenedor del escáner sea movible
function makeElementDraggable(element) {
    let isDragging = false;
    let startX, startY, offsetX, offsetY;

    element.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = element.getBoundingClientRect();
        offsetX = startX - rect.left;
        offsetY = startY - rect.top;

        element.style.cursor = 'grabbing'; // Cambiar cursor mientras se arrastra
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            element.style.left = `${e.clientX - offsetX}px`;
            element.style.top = `${e.clientY - offsetY}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        element.style.cursor = 'grab'; // Volver al cursor de agarre cuando se suelte
    });
}

// Hacer que el contenedor del video sea arrastrable
document.addEventListener('DOMContentLoaded', () => {
    const scannerContainer = document.getElementById('scanner-container');
    makeElementDraggable(scannerContainer);
});
