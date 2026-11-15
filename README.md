# WlanScannerViaShelly

ioBroker-Skript (JavaScript-Adapter), das fest verbaute Shelly-Geräte (Gen2+)
als Messpunkte für fremde WLANs nutzt.

Anlass war ein Zigbee-Netz mit schwankender Signalqualität. Zigbee und WLAN
teilen sich das 2,4-GHz-Band. Die Frage war: Welches Nachbar-WLAN funkt auf
einem Kanal, der das Zigbee-Netz stört, und aus welcher Richtung kommt es?
Dann weiß man, wen man bitten kann, den Kanal zu wechseln.

## Wie es funktioniert

- Das Skript fragt eine Liste von Shellys per RPC `WiFi.Scan` ab
  (`http://<ip>/rpc/WiFi.Scan`).
- Pro Shelly, Netz (SSID) und Access Point (BSSID) speichert es die
  Signalstärke (RSSI) unter `0_userdata.0.ShellyWLANScans.<Shelly>.networks.…`.
- Unter `…summary` wertet es aus, an welchem Shelly jedes Netz am stärksten
  und am schwächsten ankommt. Weil die Standorte der Shellys bekannt sind,
  ergibt das eine grobe Richtung.

## Hinweise

- Ein `WiFi.Scan` kann die WLAN-Verbindung des Shelly kurz unterbrechen. Nur
  Shellys ohne eigene Skripte oder Automatik verwenden und nicht zu oft
  scannen (Voreinstellung: alle 5 Minuten).
- RSSI-Werte schwanken durch Wände und Möbel stark. Für eine Richtung über
  mehrere Durchläufe mitteln, für eine echte Ortung reicht es nicht.
- Die IP-Liste oben im Skript an das eigene Netz anpassen.
