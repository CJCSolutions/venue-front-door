'use strict';

// Entry file. Hostinger needs listen() to be called straight away.
const { app, store, PORT, DEMO } = require('./app');

app.listen(PORT, () => console.log(`Venue front door on :${PORT} (${store.kind} storage${DEMO ? ', demo mode' : ''})`));
