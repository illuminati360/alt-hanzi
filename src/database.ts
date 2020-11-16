import * as MRE from '@microsoft/mixed-reality-extension-sdk';

export type levelData = {
    char: string,
    transform: MRE.ActorTransformLike
}[];

export class PinyinDatabase{
    private components: any;
    private pinyin: any;
    private trie: any;
    private _syllables: any;
    private _dictionary: any;
    private _characters: any;
    private _radicals: any;

    get syllables() {return this._syllables}
    get phonetics() {return this.pinyin.phonetics}
    get rowNum() {return this.pinyin.rows.length}
    get colNum() {return this.pinyin.cols.length}
    get rows() {return this.pinyin.rows}
    get cols() {return this.pinyin.cols}

    get initials() {return this.components.initials.split(' ')}
    get finals() {return this.components.finals.split(' ')}
    get wholes() {return this.components.wholes.split(' ')}
    get characters() {return this._characters}
    get dictionary() {return this._dictionary}
    get radicals() {return this._radicals}

    constructor(){
        this.components = ({
            initials: 'b p m f d t n l g k h j q x zh ch sh r z c s y w',
            finals: 'a o e i u ü ai ei ui ao ou iu ie üe er an en in un ün ang eng ing ong',
            wholes: 'zhi chi shi ri zi ci si yi wu yu yue yuan yin yun ying',
            tones: '1 2 3 4'
        })

        this.pinyin = require('../public/json/phonetics.json');

        this.trie = {};
        this.pinyin.phonetics.forEach((r: string[]) => r.forEach((s: string) => {
            let ptr: any = this.trie;
            for (let i=0; i<s.length; i++) {
                ptr = ptr[s[i]] = ptr[s[i]] || {};
            }
        }));

        this._syllables = [].concat(...this.pinyin.phonetics);
        this._dictionary = require('../public/json/hanzi.json');
        this._characters = Object.keys(this._dictionary).sort((a,b)=>{return this._dictionary[a].id - this._dictionary[b].id});

        let radicalDictionary = require('../public/json/radical.json');
        this._radicals = Object.keys(radicalDictionary).sort((a,b)=>{return radicalDictionary[a].id - radicalDictionary[b].id});

        // merge dictionaries
        this._dictionary = Object.assign({}, this._dictionary, radicalDictionary);
    }

    public find(s: string){
        var ptr = this.trie;
        for (var i=0; i<s.length; i++) {
            if (!ptr[s[i]]) return false;
            ptr = ptr[s[i]];
        }
        return true;
    }
}

export enum KanaType {
    KATA = "kata",
    HIRA = "hira",
    ROMA = "roma"
}

export class KanjiDatabase{
    private components: any;
    private _gojuon: any;
    private _dakuon: any;
    private _youon: any;
    private _kanji: any;
    private _dictionary: any;
    private _toRoma: any;

    get kanji() {return this._kanji};
    get dictionary() {return this._dictionary};
    get gojuon() {return this._gojuon};
    get dakuon() {return this._dakuon};
    get youon() {return this._youon};
    public roma(char: string) {return (this._toRoma[char] !== undefined) ? this._toRoma[char] : ''};
    public isKanji(char: string) {return this._kanji.includes(char);}

    constructor(){
        let kana = require('../public/json/kana.json');
        this._gojuon = kana.goju;
        this._dakuon = kana.daku;
        this._youon = kana.you;

        this._toRoma = {};
        [ ...this._gojuon.kana, ...this._dakuon.kana, ...this._youon.kana ].forEach(r => {
            r.forEach((k: any) => {
                [KanaType.HIRA, KanaType.KATA, KanaType.ROMA].forEach((t: string) =>{
                    let char = k[t];
                    this._toRoma[char] = k[KanaType.ROMA];
                });
            })
        });

        this._dictionary = require('../public/json/kanji.json');
        this._kanji = Object.keys(this._dictionary).sort((a,b)=>{return this._dictionary[a].id - this._dictionary[b].id});
    }
}

export class EngDatabase{
    private _words: any;

    get words() {return this._words};
    constructor(){
        this._words = require('../public/eng/english.json');
    }
}