# Doplněk pro Fast RPC do Google Chrome

publikováno na https://chrome.google.com/webstore/detail/fastrpc/fndmaalidmchgmihkckimolpjiimjgfe?authuser=1

Původní zdrojové kódy jsem převzal od Ondry Žáry. Funkcionalita:

- párování requestů
- formátované a barevně podbarvené zobrazení požadavků/odpovědí ze serveru

## Instalace

- nainstalovat jako doplněk `crx` přímo do Chromu
- nebo jako rozbalený doplněk, kde je cesta k adresáři `source`. V tomto případě je potřeba zaškrtnout `developer mode`.

## Použití

Po nainstalování doplňku se potom vytvoří nový panel na úrovni konzole, sítě atd.

## Náhled na vývojářské nástroje

![Extensions](/chrome.png)

## Changelog

`1.0.2` - 19. 4. 2016
- zrušené párování, protože to nedělalo dobrotu
- jquery plugin pro lepší manipulaci s JSON objektem

`1.0.1` - 1. 3. 2016
- přidána podpora pro application/x-frpc

`1.0.0` - 22. 2. 2016
- upravené párování, ale i tak se občas stane, že se překryjí dvě dvojice

## Autor

Roman Makudera 2016 (c),
Ondřej Žára,
Honza Štěpán
