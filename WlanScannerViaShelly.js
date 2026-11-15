/***********************************************
 * Multi-Shelly WLAN Scanner für ioBroker
 * - mehrere Shellys nach IP in der Liste
 * - automatische Namensauflösung
 * - Speicherung nach Gerätename
 * - Analyse: best/worst Signal für jedes WLAN
 ***********************************************/

// ==== Konfiguration ====
//const shellyIPs = ['192.168.246.166']

const shellyIPs = ['192.168.246.166', '192.168.246.97', '192.168.246.135', '192.168.246.164']; // weitere IPs hier einfügen
const intervalSeconds = 15;
const basePath = '0_userdata.0.ShellyWLANScans';

// interne Cache für Name→IP und Scan
const shellyInfo = {}; // { name: { ip, rawData, resultList } }

// ==== Initialisierung ====
schedule(`*/${intervalSeconds} * * * * *`, () => {
    shellyIPs.forEach(scanShelly);
});

async function scanShelly(ip) {
    try {
        // Name holen, falls noch nicht im Cache
        let name = null;
        const known = Object.entries(shellyInfo).find(([n, obj]) => obj.ip === ip);
        if (known) {
            name = known[0];
        } else {
            const sysinfo = await shellyRpc(ip, 'Sys.GetConfig');
            name = sysinfo.device?.name || ip.replace(/\./g, '_');
            shellyInfo[name] = { ip };
            //console.log(`Shelly ${ip}: ` , 'name'); 
            //console.log(name)
        }

        const scanResult = await shellyRpc(ip, 'WiFi.Scan');
        const wlanList = Array.isArray(scanResult.results) ? scanResult.results : [];
        //console.log("Scan results:");
        //console.log(scanResult);
        //console.log(wlanList);

        shellyInfo[name].rawData = scanResult;
        shellyInfo[name].wlanList = wlanList;
        //console.log("shellyInfo")
        //console.log(shellyInfo);
        //console.log(name);
        //console.log(shellyInfo[name]);

        const rawState = `${basePath}.${name}.raw`;
        const netPath = `${basePath}.${name}.networks`;

        await ensureStateExists(rawState, JSON.stringify(scanResult), {
            type: 'string', role: 'json', name: `Raw WLAN JSON (${name})`
        });

        const seenMACs = new Set();

        for (const net of wlanList) {
            const ssidRaw = net.ssid || 'unknown_ssid';
            const ssidSafe = ssidRaw.replace(/[^\w\-]/g, '_');
            const mac = (net.bssid || 'unknown_mac').replace(/:/g, '_');
            const path = `${netPath}.${ssidSafe}.${mac}`;
            seenMACs.add(`${ssidSafe}.${mac}`);

            await ensureStateExists(`${path}.rssi`, net.rssi, {
                type: 'number',
                role: 'value.signal',
                name: `RSSI für ${ssidRaw} (${mac})`
            });

            await ensureStateExists(`${path}.channel`, net.channel, {
                type: 'number',
                role: 'value',
                name: `Kanal für ${ssidRaw} (${mac})`
            });
        }

        // Verlorene WLANs für diesen Shelly markieren
        const knownRssiStates = $(`0_userdata.0.ShellyWLANScans.${name}.networks.*.*.rssi`);
        //console.log("known RSSI states : ");
        //console.log(knownRssiStates);
        //console.log("seen Macs : ");
        //console.log(seenMACs);

        // check on duplicates
        const allIds = new Set();
        knownRssiStates.each((id) => {
            if (allIds.has(id)) {
                console.log(`⚠️ Duplicate detected: ${id}`, 'warn');
            }
            allIds.add(id);
        });

        const seenKeys = new Set();

        knownRssiStates.each(async (id) => {
            const parts = id.split('.');
            const ssid = parts[parts.length - 3];
            const mac = parts[parts.length - 2];
            const key = `${ssid}.${mac}`;
            //console.log(key);

            if (seenKeys.has(key)) return; // Duplikat vermeiden
            seenKeys.add(key);
            //console.log("added: " + key);
    
            if (!seenMACs.has(key)) {
                await setStateAsync(id, -100, true);
                //console.log("set to -100: "+ id); // seltsamerweise sehe ich hier immer noch duplikate....
            }
        });

     

        // Nach jedem Scan: Auswertung WLANs über alle Geräte
        await analyzeWifiAcrossShellys();

    } catch (e) {
        log(`Fehler bei Shelly ${ip}: ${e.message}`, 'error');
    }
}

// ==== RPC Helfer ====
function shellyRpc(ip, method) {
    const url = `http://${ip}/rpc/${method}`;
    const timeout = method === 'WiFi.Scan' ? 10000 : 5000;
     //console.log(url)

    return new Promise((resolve, reject) => {
        httpGet(url, { timeout }, (error, result) => {
            if (error) {
               reject(new Error(`HTTP Fehler: ${error}`));
            } else if (typeof result === 'object' && typeof result.data === 'string') {
                try {
                    //console.log(result)
                    const parsed = JSON.parse(result.data);
                    //console.log(result.data);
                    resolve(parsed);
                    //console.log(parsed)
                } catch (e) {
                    reject(new Error('Fehler beim Parsen von result.data: ' + e.message));
                    reject(new Error(`JSON Parse Fehler: ${parseError.message}. Rohdaten: ${result}`));
                }
            } else {
                reject(new Error('Unerwartetes Format: ' + JSON.stringify(result)));
            }
        });
    });
}



// ==== State mit optionaler History für rssi ====
async function ensureStateExists(id, value, common) {
  try {  
    const exists = await existsState(id);
    if (!exists) {
        await createStateAsync(id, value, false, common);
        //console.log("created state: " + id);

        if (id.endsWith('.rssi')) {
            await extendObjectAsync(id, {
                common: {
                    custom:{
                        "history.0": {
                         "enabled": true,
                         "aliasId": "",
                         "debounceTime": 0,
                          "blockTime": 0,
                          "changesOnly": true,
                          "changesRelogInterval": "0",
                          "changesMinDelta": "0",
                          "ignoreBelowNumber": "",
                          "disableSkippedValueLogging": false,
                          "retention": 0,
                         "customRetentionDuration": 365,
                         "maxLength": 10,
                         "enableDebugLogs": false,
                         "debounce": "1000"
                        }
                    }
                }
            });
            //console.log("extended state: " + id);

        }
    }
    await setStateAsync(id, value, true);
    //console.log("state set: " + id + value);
  } catch (e) {
        console.log(`Fehler bei Set State ${id} = ${value} : ${e.message}`, 'error');
        console.log(e);
  }
}

// ==== WLAN-Stärken geräteübergreifend analysieren ====
async function analyzeWifiAcrossShellys() {
    const ssidMap = {}; // { ssid.mac: [{ name, rssi }] }

    for (const [name, { wlanList }] of Object.entries(shellyInfo)) {
        if (!Array.isArray(wlanList)) continue;

        for (const net of wlanList) {
            const ssid = (net.ssid || 'unknown_ssid').replace(/[^\w\-]/g, '_');
            const mac = (net.bssid || 'unknown_mac').replace(/:/g, '_');
            const key = `${ssid}.${mac}`;

            if (!ssidMap[key]) ssidMap[key] = [];
            ssidMap[key].push({ name, rssi: net.rssi });
        }
    }

    for (const [key, entries] of Object.entries(ssidMap)) {
        const [ssid, mac] = key.split('.');
        const best = entries.reduce((a, b) => (a.rssi > b.rssi ? a : b));
        const worst = entries.reduce((a, b) => (a.rssi < b.rssi ? a : b));

        const base = `${basePath}.summary.${ssid}.${mac}`;
        await ensureStateExists(`${base}.bestDevice`, best.name, {
            type: 'string', role: 'text', name: 'Stärkstes Gerät'
        });
        await ensureStateExists(`${base}.bestRSSI`, best.rssi, {
            type: 'number', role: 'value.signal', name: 'Stärkstes RSSI'
        });
        await ensureStateExists(`${base}.worstDevice`, worst.name, {
            type: 'string', role: 'text', name: 'Schwächstes Gerät'
        });
        await ensureStateExists(`${base}.worstRSSI`, worst.rssi, {
            type: 'number', role: 'value.signal', name: 'Schwächstes RSSI'
        });
    }
}
