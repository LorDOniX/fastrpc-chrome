# Doplněk pro Fast RPC do Google Chrome

publikováno na https://chrome.google.com/webstore/detail/fastrpc/fndmaalidmchgmihkckimolpjiimjgfe

Původní zdrojové kódy jsem převzal od Ondry Žáry. Funkcionalita:

- formátované a barevně podbarvené zobrazení požadavků/odpovědí ze serveru
- jquery plugin pro zobrazení a snadnou manipulaci s JSON daty

## Instalace

- použít odkaz z webstore
- nainstalovat jako doplněk `crx` přímo do Chromu
- nebo jako rozbalený doplněk, kde je cesta k adresáři `source`. V tomto případě je potřeba zaškrtnout `developer mode`.

## Použití

Po nainstalování doplňku se potom vytvoří nový panel na úrovni konzole, sítě atd.

## Náhled na vývojářské nástroje

![Extensions](/chrome.png)

## Changelog

`1.0.9` - 9. 6. 2016
- bugfix forEach a chybějící this

`1.0.8` - 8. 6. 2016
- párování requestů, refaktoring, podbarvení aktuálního řádku

`1.0.7` - 24. 5. 2016
- podbarvení parametrů FRPC volání - nižší úrovně

`1.0.6` - 20. 5. 2016
- podbarvené number/string u parametrů FRPC volání

`1.0.5` - 21. 4. 2016
- fix pluginu, který neumí zobrazovat Date

`1.0.4` - 20. 4. 2016
- fix zobrazení JSON dat (collapse, fold)

`1.0.3` - 20. 4. 2016
- fix zoomování v otevřeném okně
- fix zobrazení JSON dat

`1.0.2` - 19. 4. 2016
- zrušené párování, protože to nedělalo dobrotu
- jquery plugin pro lepší manipulaci s JSON objektem

`1.0.1` - 1. 3. 2016
- přidána podpora pro application/x-frpc

`1.0.0` - 22. 2. 2016
- upravené párování, ale i tak se občas stane, že se překryjí dvě dvojice

## TODO

- úprava zobrazení requestů: description({firm: [...]}, {fetchPhoto:true, ratios : [...]})

## Autor

Roman Makudera 2016 (c),
Ondřej Žára,
Honza Štěpán
