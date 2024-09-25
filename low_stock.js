document.addEventListener('DOMContentLoaded', async () => {
    const db = new ProductDatabase(); // Asegúrate de que la clase ProductDatabase esté disponible
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
