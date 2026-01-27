$content = Get-Content 'c:\Projeto3\public\escalas\js\escala_nova.js'
$content = $content[0..7175] + $content[7177..($content.Length-1)]
$content | Set-Content 'c:\Projeto3\public\escalas\js\escala_nova.js'