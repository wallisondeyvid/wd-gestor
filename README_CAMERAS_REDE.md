# Câmeras de Rede (RTSP/HLS) no Browser

Este projeto usa getUserMedia (WebRTC) para capturar vídeo diretamente no navegador. Câmeras IP em rede normalmente expõem RTSP (ou às vezes HLS), que não é reproduzido nativamente no browser. Para integrá-las, utilizamos um gateway que converte RTSP em um formato compatível com WebRTC ou MSE.

## Opções de Gateway

1. WebRTC Gateway (recomendado)
   - Exemplos: 
     - Pion + gortsplib/mediamtx (rtsp→webrtc)
     - [MediaMTX](https://github.com/bluenviron/mediamtx) com `webrtc` habilitado
     - [OvenMediaEngine](https://ovenmediaengine.com/) (rtsp→webrtc)
   - Benefícios: baixa latência, compatível com getUserMedia? Não diretamente. Em geral você toca via `<video srcObject>`/PeerConnection negociado e injeta no `<video>`. Para captura com o nosso fluxo, podemos:
     - Usar `<video>` de reprodução do WebRTC e ler frames via canvas (como já fazemos com a câmera local)
     - Notas: não há `MediaStreamTrack` de saída universal; a integração é pela própria sessão PeerConnection.

2. HLS + MSE (fallback)
   - Exemplo: Nginx-RTMP → HLS → hls.js
   - Benefícios: interoperável, porém latência maior (3–10s). Adequado para visualização, não ideal para liveness estrito.

3. WebSocket MJPEG/fragmentos
   - Simples, porém sem som e sem clock preciso; também com latência e qualidade variáveis.

## Fluxo sugerido (MediaMTX)

- Subir MediaMTX apontando para o RTSP da câmera.
- Habilitar a saída WebRTC (ou HLS como alternativa).
- No front-end, abrir a sessão WebRTC (oferta/sinalização) e renderizar o stream no `<video>` do modal em vez do `getUserMedia`.
- Reutilizar o nosso pipeline (canvas + landmarks) para captura e liveness.

## Considerações de Segurança

- Proteger o gateway atrás da sua API (tokens, origem, CORS controlado).
- Evitar expor RTSP/HLS diretamente ao público.
- Sanitizar URLs fornecidas por usuários; whitelist de câmeras conhecidas.

## Próximos Passos

- Criar um endpoint backend de sinalização (se optar por WebRTC).
- Abstrair no front-end uma função `startNetworkCamera(url)` que:
  - Troca a origem do `<video>` para o PeerConnection/HLS player
  - Mantém `drawImage` no mesmo canvas de captura
  - Integra com nossa lógica de liveness e captura atual
- Adicionar uma configuração de ambiente para habilitar/desabilitar câmeras de rede.
