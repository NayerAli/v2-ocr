// Démarre l'application OCR en faisant pointer "localhost:8000" (dans le conteneur)
// vers Supabase. Ainsi la même adresse fonctionne côté navigateur et côté serveur.
const net = require('net')

function relais(hote) {
  const serveur = net.createServer((client) => {
    const amont = net.connect(8000, 'kong')
    const fermer = () => { client.destroy(); amont.destroy() }
    client.on('error', fermer)
    amont.on('error', fermer)
    client.pipe(amont).pipe(client)
  })
  // ::1 peut ne pas exister si l'IPv6 est désactivé : ce n'est pas grave.
  serveur.on('error', (e) => console.error(`[relais] ${hote} : ${e.message}`))
  serveur.listen(8000, hote)
}

relais('127.0.0.1')
relais('::1')

require('/opt/server.js')
