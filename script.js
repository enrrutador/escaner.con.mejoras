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
    }, 2500); // El mensaje se muestra durante 3 segundos
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
        suggestions.innerHTML = ''; // Limpiar las sugerencias previas

        if (query) {
            const allProducts = await db.getAllProducts(); // Obtener todos los productos
            const fuse = new Fuse(allProducts, { keys: ['description'], threshold: 0.4 });
            const results = fuse.search(query); // Realiza la búsqueda difusa

            // Agregar las sugerencias al datalist
            results.forEach(result => {
                const option = document.createElement('option');
                option.value = result.item.description;
                suggestions.appendChild(option);
            });
        }
    });

    // Evitar búsqueda automática al seleccionar una opción de autocompletado
    descriptionInput.addEventListener('change', async (e) => {
        const selectedDescription = e.target.value.trim();
        const allProducts = await db.getAllProducts();
        const selectedProduct = allProducts.find(product => product.description === selectedDescription);
        if (selectedProduct) {
            fillForm(selectedProduct); // Llenar el formulario con el producto seleccionado
        }
    });

    // Función para iniciar el escáner de códigos de barras
    async function startScanner() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            video.srcObject = stream;
            scannerContainer.style.display = 'flex';
            video.play();
            scan();
        } catch (error) {
            showToast('Error accediendo a la cámara. Asegúrate de que tu navegador tiene permiso para usar la cámara.');
        }
    }

    async function scan() {
        if (barcodeDetector && video.readyState === video.HAVE_ENOUGH_DATA) {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes.length > 0) {
                barcodeInput.value = barcodes[0].rawValue;
                stopScanner();
                searchProduct(barcodes[0].rawValue);
            }
        }
        requestAnimationFrame(scan);
    }

    function stopScanner() {
        video.srcObject.getTracks().forEach(track => track.stop());
        scannerContainer.style.display = 'none';
    }

    // Búsqueda solo al presionar el botón de "Buscar"
    document.getElementById('search-button').addEventListener('click', () => {
        const query = barcodeInput.value.trim() || descriptionInput.value.trim();
        if (query) {
            searchProduct(query);
        } else {
            showToast('Por favor, introduce un código de barras o nombre de producto para buscar.');
        }
    });

    // Función para buscar productos
    async function searchProduct(query) {
        console.log('Iniciando búsqueda del producto:', query); // Depuración

        const isBarcode = /^[\w-]+$/.test(query); // Modificado para aceptar letras, números y guiones
        let product;

        if (isBarcode) {
            console.log('Buscando por código de barras en IndexedDB...');
            product = await db.getProduct(query);
            console.log('Resultado de la búsqueda local:', product);
        }

        if (!product) {
            console.log('Buscando en OpenFoodFacts...');
            product = await searchInOpenFoodFacts(query);
            console.log('Resultado de OpenFoodFacts:', product);
        }

        if (product) {
            cache.set(query, product);
            fillForm(product);
            console.log('Producto encontrado y formulario llenado.');
            productNotFoundAlertShown = false;
        } else {
            if (!productNotFoundAlertShown) {
                showToast('Producto no encontrado.');
                productNotFoundAlertShown = true;
            }
        }
    }

    async function searchInOpenFoodFacts(query) {
        try {
            const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${query}.json`);
            const data = await response.json();

            if (data.product) {
                const product = {
                    barcode: data.product.code,
                    description: data.product.product_name || 'Sin nombre',
                    stock: 0,
                    minStock: 0,
                    purchasePrice: 0,
                    salePrice: 0,
                    image: data.product.image_url || ''
                };

                await db.addProduct(product); // Guardar en la base de datos local
                return product;
            }
        } catch (error) {
            console.error('Error al buscar en OpenFoodFacts:', error);
        }
        return null;
    }

    function fillForm(product) {
        barcodeInput.value = product.barcode || '';
        descriptionInput.value = product.description || '';
        stockInput.value = product.stock || '';
        minStockInput.value = product.minStock || '';
        purchasePriceInput.value = product.purchasePrice || '';
        salePriceInput.value = product.salePrice || '';

        // Verifica si el elemento de imagen existe y si hay una imagen disponible
        if (productImage && product.image) {
            productImage.src = product.image;
            productImage.style.display = 'block';
        } else if (productImage) {
            productImage.style.display = 'none';
        }
    }

    document.getElementById('scan-button').addEventListener('click', async () => {
        if (!('BarcodeDetector' in window)) {
            showToast('API de detección de códigos de barras no soportada en este navegador.');
            return;
        }

        if (!barcodeDetector) {
            barcodeDetector = new BarcodeDetector({ formats: ['ean_13'] });
        }

        startScanner();
    });

    document.getElementById('save-button').addEventListener('click', async () => {
        const product = {
            barcode: barcodeInput.value.trim(),
            description: descriptionInput.value.trim(),
            stock: parseInt(stockInput.value) || 0,
            minStock: parseInt(minStockInput.value) || 0,
            purchasePrice: parseFloat(purchasePriceInput.value) || 0,
            salePrice: parseFloat(salePriceInput.value) || 0,
        };

        await db.addProduct(product);
        showToast('Producto guardado correctamente.');
        clearForm();
    });

    document.getElementById('clear-button').addEventListener('click', clearForm);

    function clearForm() {
        barcodeInput.value = '';
        descriptionInput.value = '';
        stockInput.value = '';
        minStockInput.value = '';
        purchasePriceInput.value = '';
        salePriceInput.value = '';

        // Verifica si el elemento de imagen existe antes de intentar modificarlo
        if (productImage) {
            productImage.src = '';
            productImage.style.display = 'none';
        }
    }

    // Modificar el botón para redirigir a la página de "low_stock.html"
    lowStockButton.addEventListener('click', () => {
        window.location.href = 'low_stock.html'; // Redirige a la página de productos con stock bajo
    });

document.getElementById('import-button').addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const products = XLSX.utils.sheet_to_json(worksheet);

            console.log('Productos leídos del archivo:', products);

            let importedCount = 0;
            for (let product of products) {
                console.log('Procesando producto:', product);
                
                // Función auxiliar para buscar la clave correcta, mejorada para manejar diferentes nombres de columnas
                const findKey = (possibleKeys) => {
                    return possibleKeys.find(key => product.hasOwnProperty(key));
                };

                // Buscar las claves correctas en el archivo
                const barcodeKey = findKey(['Código de barras', 'Codigo de Barras', 'codigo de barras', 'barcode', 'Barcode']);
                const descriptionKey = findKey(['Descripción', 'Descripcion', 'descripcion', 'description', 'Description']);
                const stockKey = findKey(['Stock', 'stock']);
                const minStockKey = findKey(['Stock Mínimo', 'Stock minimo', 'stock minimo', 'min stock']);
                const purchasePriceKey = findKey(['Precio de Compra', 'precio de compra', 'purchase price', 'Purchase Price']);
                const salePriceKey = findKey(['Precio de Venta', 'precio de venta', 'sale price', 'Sale Price']);
               

                if (!barcodeKey) {
                    console.warn('Producto sin código de barras:', product);
                    continue; // Si no tiene código de barras, ignorar el producto
                }

                try {
                    const newProduct = {
                        barcode: product[barcodeKey].toString(),
                        description: product[descriptionKey] || '',
                        stock: parseInt(product[stockKey] || '0'),
                        minStock: parseInt(product[minStockKey] || '0'),
                        purchasePrice: parseFloat(product[purchasePriceKey] || '0'),
                        salePrice: parseFloat(product[salePriceKey] || '0'),
                        image: product[imageKey] || ''
                    };

                    console.log('Intentando agregar producto:', newProduct);
                    await db.addProduct(newProduct); // Agregar a la base de datos
                    importedCount++;
                    console.log('Producto agregado con éxito');
                } catch (error) {
                    console.error('Error al agregar producto:', product, error);
                }
            }

            console.log(`${importedCount} productos importados correctamente.`);
            showToast(`${importedCount} productos importados correctamente.`);
        } catch (error) {
            console.error('Error durante la importación:', error);
            showToast('Error durante la importación. Revisa la consola para más detalles.');
        }
    };

    reader.onerror = (error) => {
        console.error('Error al leer el archivo:', error);
        showToast('Error al leer el archivo. Por favor, intenta de nuevo.');
    };

    reader.readAsArrayBuffer(file);
});


    document.getElementById('export-button').addEventListener('click', async () => {
        const allProducts = await db.getAllProducts();
        const worksheet = XLSX.utils.json_to_sheet(allProducts.map(product => ({
            'Código de Barras': product.barcode,
            'Descripción': product.description,
            'Stock': product.stock,
            'Stock Mínimo': product.minStock,
            'Precio de Compra': product.purchasePrice,
            'Precio de Venta': product.salePrice
        })));
        
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");
        
        XLSX.writeFile(workbook, "productos_exportados.xlsx");
        showToast('Exportación completada.');
    });
});
