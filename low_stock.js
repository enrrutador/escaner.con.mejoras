// Clase ProductDatabase para manejar IndexedDB
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

    async getAllProducts() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const request = transaction.objectStore(this.storeName).getAll();

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject('Error getting all products:', event.target.error);
        });
    }
}

// Código para manejar los productos con stock bajo
document.addEventListener('DOMContentLoaded', async () => {
    const db = new ProductDatabase();
    await db.init(); // Inicializar la base de datos

    const lowStockList = document.getElementById('low-stock-list'); // Contenedor donde se mostrarán los productos

    try {
        // Obtener todos los productos y filtrar aquellos que tienen stock actual menor o igual que el stock mínimo
        const allProducts = await db.getAllProducts();
        const lowStockProducts = allProducts.filter(product => product.stock <= product.minStock);

        // Mostrar los productos en la lista
        if (lowStockProducts.length > 0) {
            lowStockProducts.forEach(product => {
                const li = document.createElement('li');
                li.textContent = `${product.description} (Código: ${product.barcode}) - Stock Actual: ${product.stock}, Stock Mínimo: ${product.minStock}`;
                lowStockList.appendChild(li); // Agregar producto a la lista
            });
        } else {
            lowStockList.innerHTML = '<li>No hay productos con stock bajo.</li>'; // Mostrar mensaje si no hay productos
        }
    } catch (error) {
        console.error('Error al cargar productos con stock bajo:', error);
        lowStockList.innerHTML = '<li>Error al cargar los productos.</li>';
    }

    // Botón para volver a la página del escáner
    const backButton = document.getElementById('back-button');
    backButton.addEventListener('click', () => {
        window.location.href = 'index.html'; // Redirige a la página principal del escáner
    });
});
