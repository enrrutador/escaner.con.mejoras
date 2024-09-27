/*
  © [2024] [SYSMARKETHM]. Todos los derechos reservados.
  Este archivo es parte de [M-Escaner], propiedad de [SYSMARKETHM].
  El uso, distribución o reproducción no autorizados de este material están estrictamente prohibidos.
  Para obtener permiso para usar cualquier parte de este código, por favor contacta a [https://sysmarket-hm.web.app/].
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
                console.log('Base de datos inicializada correctamente.');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const store = db.createObjectStore(this.storeName, { keyPath: 'barcode' });
                store.createIndex('description', 'description', { unique: false });
                console.log('Estructura de la base de datos creada.');
            };
        });
    }

    async addProduct(product) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(product);

            request.onsuccess = () => {
                console.log('Producto agregado a IndexedDB:', product);
                resolve();
            };
            request.onerror = (event) => {
                console.error('Error al agregar producto a IndexedDB:', event.target.error);
                reject('Error adding product:', event.target.error);
            };
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
}

// Detectar cuando el DOM está completamente cargado
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM completamente cargado y analizado');

    const fileInput = document.getElementById('fileInput');
    const importButton = document.getElementById('import-button');

    if (!fileInput || !importButton) {
        console.error('No se encontraron elementos importantes. Verifica los IDs en tu HTML.');
        return;
    }

    console.log('Elementos de importación y botón detectados correctamente.');

    // Evento para el botón de importación
    importButton.addEventListener('click', () => {
        console.log('Botón de importación clickeado');
        fileInput.click(); // Simula el clic en el input de archivo
    });

    // Evento de cambio en el input de archivo para leer el archivo Excel
    fileInput.addEventListener('change', async (e) => {
        console.log('Evento de cambio detectado en el input de archivo');
        const file = e.target.files[0];

        if (!file) {
            showToast('Por favor, selecciona un archivo para importar.');
            return;
        }

        console.log('Archivo seleccionado:', file.name);
        const reader = new FileReader();

        reader.onload = async (e) => {
            console.log('Leyendo archivo...');
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const products = XLSX.utils.sheet_to_json(worksheet);

                console.log('Productos leídos del archivo:', products);

                if (products.length === 0) {
                    showToast('El archivo está vacío o no contiene datos válidos.');
                    return;
                }

                // Mapeos de columnas para importar
                const firstProduct = products[0];
                const columnMappings = {
                    barcode: ['Código de barras', 'Codigo de Barras', 'codigo de barras', 'barcode', 'Barcode'],
                    description: ['Descripción', 'Descripcion', 'descripcion', 'description', 'Description'],
                    stock: ['Stock', 'stock'],
                    minStock: ['Stock Mínimo', 'Stock minimo', 'stock minimo', 'min stock'],
                    purchasePrice: ['Precio de Compra', 'precio de compra', 'purchase price', 'Purchase Price'],
                    salePrice: ['Precio de Venta', 'precio de venta', 'sale price', 'Sale Price']
                };

                const findKey = (possibleKeys) => {
                    return possibleKeys.find(key => firstProduct.hasOwnProperty(key));
                };

                // Buscar las claves de las columnas en el archivo
                const barcodeKey = findKey(columnMappings.barcode);
                const descriptionKey = findKey(columnMappings.description);
                const stockKey = findKey(columnMappings.stock);
                const minStockKey = findKey(columnMappings.minStock);
                const purchasePriceKey = findKey(columnMappings.purchasePrice);
                const salePriceKey = findKey(columnMappings.salePrice);

                // Validar la presencia de la columna de código de barras
                if (!barcodeKey) {
                    console.warn('Falta la columna "Código de Barras". No se podrán identificar los productos.');
                    showToast('Error: No se encontró la columna "Código de Barras" en el archivo.');
                    return;
                }

                console.log('Claves detectadas - Código de Barras:', barcodeKey, 
                            'Descripción:', descriptionKey, 
                            'Stock:', stockKey, 
                            'Stock Mínimo:', minStockKey, 
                            'Precio de Compra:', purchasePriceKey, 
                            'Precio de Venta:', salePriceKey);

                let importedCount = 0;

                // Inicializar la base de datos antes de agregar productos
                const db = new ProductDatabase();
                await db.init();  // Asegurarse de que la base de datos está lista

                for (let product of products) {
                    try {
                        // Crear un nuevo producto con los datos del archivo Excel
                        const newProduct = {
                            barcode: barcodeKey ? product[barcodeKey].toString() : '',
                            description: descriptionKey ? product[descriptionKey] : '',
                            stock: stockKey ? parseInt(product[stockKey] || '0') : 0,
                            minStock: minStockKey ? parseInt(product[minStockKey] || '0') : 0,
                            purchasePrice: purchasePriceKey ? parseFloat(product[purchasePriceKey] || '0') : 0,
                            salePrice: salePriceKey ? parseFloat(product[salePriceKey] || '0') : 0
                        };

                        // Verificar todos los datos del producto
                        console.log('Producto preparado para agregar:', newProduct);

                        // Verificar si el producto tiene un código de barras válido
                        if (!newProduct.barcode) {
                            console.warn('Producto omitido debido a falta de código de barras:', product);
                            continue; // Saltar productos sin código de barras
                        }

                        // Agregar o actualizar el producto en la base de datos
                        await db.addProduct(newProduct);
                        console.log('Producto agregado/actualizado correctamente:', newProduct);
                        importedCount++;
                    } catch (error) {
                        console.error('Error al agregar producto:', newProduct, error);
                    }
                }

                if (importedCount > 0) {
                    showToast(`${importedCount} productos importados correctamente.`);
                } else {
                    showToast('No se importaron productos. Revisa el archivo y los datos.');
                }
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
});
