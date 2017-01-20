# Fast RPC add on for Google Chrome browser

- you can download at google store https://chrome.google.com/webstore/detail/fastrpc/fndmaalidmchgmihkckimolpjiimjgfe
- request/response are logged on the list
- request/response detail in the new window, json visualiser is used for the response data
- original source codes belongs to Ondřej Žára

## Usage

- after add on installation, run developer tools (F12)
- there is new panel at the end, called "FastRPC"

## Changelog

`1.2.0` - 20. 1. 2017
- fir for long array in the list output; limit to 10 items

`1.1.9` - 19. 1. 2017
- new window mouse scroll bugfix

`1.1.7` - 27. 10. 2016
- body size bug fix

`1.1.6` - 13. 10. 2016
- bugfix json viewer - date

`1.1.5` - 13. 10. 2016
- own json viewer

`1.1.4` - 1. 9. 2016
- copy request

`1.1.2` - 9. 8. 2016
- bool values bugfix

`1.1.1` - 8. 8. 2016
- jquery plugin update
- detail - array has 500 items limit, if there are above 100 items, whole json tree is collapsed to level 1

`1.1.0` - 4. 8. 2016
- clear all panel items on page refresh

`1.0.12` - 21. 7. 2016
- size bugfix (1000 vs 1024)

`1.0.11` - 20. 6. 2016
- frpc library update
- detail title update

`1.0.9` - 9. 6. 2016
- forEach and this bugfix

`1.0.8` - 8. 6. 2016
- matching requests, refactor, highlight of focused line

`1.0.7` - 24. 5. 2016
- colored FRPC parameters

`1.0.6` - 20. 5. 2016
- colored number/string values in FRPC

`1.0.5` - 21. 4. 2016
- add support for jquery viewer and object Date

`1.0.4` - 20. 4. 2016
- json collapse and fold bugfix

`1.0.3` - 20. 4. 2016
- detail zoom bugfix
- jquery viewer bugfix

`1.0.2` - 19. 4. 2016
- canceled matching requests - useless
- jquery plugin for visualise json objects

`1.0.1` - 1. 3. 2016
- add support for the application/x-frpc

`1.0.0` - 22. 2. 2016
- improved matching of requests - but is not 100% correct

## Author

Roman Makudera 2016 (c),
Ondřej Žára,
Honza Štěpán
