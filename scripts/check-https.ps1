# Contrôle du déploiement HTTPS — à lancer après `pm2 start ecosystem.config.js`.
#
#   powershell -ExecutionPolicy Bypass -File scripts\check-https.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\check-https.ps1 -Hote gmon.npgandour.com -Port 8082 -Ip 10.10.10.200
#
# Vérifie, dans l'ordre : le serveur répond en TLS, le certificat est valide
# pour le nom d'hôte, le HTTP en clair est redirigé, et une URL restée sur
# l'IP du serveur est bien réécrite vers le nom d'hôte (sinon les écrans déjà
# déployés tomberaient en erreur de certificat).

param(
  [string]$Hote = "gmon.npgandour.com",
  [int]$Port    = 8082,
  [string]$Ip   = "",
  # Force la resolution du nom vers cette IP, sans toucher au DNS ni au fichier
  # hosts. Permet de valider le certificat AVANT que le DNS ne pointe sur la
  # machine, ou de tester en local :
  #   -Hote gmon.npgandour.com -ResoudreVers 127.0.0.1
  [string]$ResoudreVers = ""
)

$ok = 0; $ko = 0
# Options communes a tous les appels curl.
$curlBase = @("-s", "--max-time", "20")
if ($ResoudreVers) { $curlBase += @("--resolve", "$Hote`:$Port`:$ResoudreVers") }

# curl.exe renvoie un tableau de lignes. Le caster en chaine avec "$x" les
# recolle avec des espaces et fait disparaitre les sauts de ligne : on traite
# donc le tableau tel quel, en ne decoupant que si on recoit une seule chaine.
function EnteteLocation($entetes) {
  $lignes = if ($entetes -is [array]) { $entetes } else { "$entetes" -split "`r?`n" }
  $ligne = $lignes |
    ForEach-Object { [string]$_ } |
    Where-Object { $_ -match '^\s*[Ll]ocation:' } |
    Select-Object -First 1
  if (-not $ligne) { return "" }
  return ($ligne -replace '^\s*[Ll]ocation:\s*', '').Trim()
}
function Resultat($libelle, $reussi, $detail) {
  if ($reussi) { Write-Host "  [OK]  $libelle" -ForegroundColor Green; $script:ok++ }
  else         { Write-Host "  [KO]  $libelle" -ForegroundColor Red;   $script:ko++ }
  if ($detail) { Write-Host "        $detail" -ForegroundColor DarkGray }
}

Write-Host ""
Write-Host "Controle HTTPS - $Hote`:$Port" -ForegroundColor Cyan
Write-Host ("-" * 50)

# 1. Le nom d'hôte résout
if ($ResoudreVers) {
  Resultat "DNS : contourne (-ResoudreVers $ResoudreVers)" $true `
           "le nom est force vers cette IP, le DNS reel n'est pas teste"
  if (-not $Ip) { $Ip = $ResoudreVers }
} else {
  try {
    $dns = [System.Net.Dns]::GetHostAddresses($Hote) | Select-Object -First 1
    Resultat "DNS : $Hote resout" $true "-> $dns"
    if (-not $Ip) { $Ip = $dns.IPAddressToString }
  } catch {
    Resultat "DNS : $Hote resout" $false $_.Exception.Message
  }
}

# 2. Handshake TLS + certificat valide pour ce nom (sans -k : la validation compte)
$rep = & curl.exe @curlBase -o NUL -w "%{http_code} %{ssl_verify_result}" "https://$Hote`:$Port/" 2>&1
$champs = "$rep".Trim() -split '\s+'
$code = $champs[0]; $verif = $champs[1]
Resultat "TLS : certificat accepte pour $Hote" ($code -eq "200" -and $verif -eq "0") `
         "code HTTP $code, verification certificat $verif (0 = valide)"

# 3. HTTP en clair sur le meme port -> redirection 301 vers HTTPS
$loc = EnteteLocation (& curl.exe @curlBase -o NUL -D - "http://$Hote`:$Port/" 2>&1)
Resultat "Redirection : http -> https sur le meme port" ($loc -match "^https://$Hote") `
         "Location: $loc"

# 4. Une URL restee sur l'IP est reecrite vers le nom d'hote
if ($Ip) {
  $locIp = EnteteLocation (& curl.exe -s --max-time 20 -o NUL -D - "http://$Ip`:$Port/" 2>&1)
  Resultat "Ecrans restes sur l'IP : redirection vers le nom d'hote" `
           ($locIp -match "^https://$Hote") `
           "Location: $locIp   (une IP ici casserait le certificat)"
}

# 5. L'API repond bien a travers TLS
$api = & curl.exe @curlBase -o NUL -w "%{http_code}" "https://$Hote`:$Port/api/v2/lignes" 2>&1
Resultat "API : /api/v2/lignes repond en HTTPS" ("$api".Trim() -eq "200") "code HTTP $api"

Write-Host ("-" * 50)
if ($ko -eq 0) { Write-Host "$ok controle(s) OK - deploiement conforme" -ForegroundColor Green }
else           { Write-Host "$ok OK / $ko en echec" -ForegroundColor Red }
Write-Host ""
