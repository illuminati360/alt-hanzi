### install 
```
npm install
```


### build
```
npm run build
```

### run
```
# hanzi app
npm start
# kanji app
KANJI = true npm start
# english app
ENG = true npm start
```

### HOWTO: add new words to the english app
- add new entry to `public/eng/english.json` (`rotation` is optional)
```
{
    "id": 1,
    "info": "Good Morning",
    "model": "models/GoodMorning.glb",
    "thumbnail": "models/GoodMorning.png",
    "rotation": {
        "x": 90,
        "y": 0,
        "z": 0
    }
},
```
- add models and thumbnail pictures to the corresponding folder