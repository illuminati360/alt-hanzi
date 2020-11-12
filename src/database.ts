export class PinyinDatabase{
    private components: any;
    private pinyin: any;
    private trie: any;
    private _syllables: any;
    private _dictionary: any;
    private _characters: any;

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

    constructor(){
        this.components = ({
            initials: 'b p m f d t n l g k h j q x zh ch sh r z c s y w',
            finals: 'a o e i u ü ai ei ui ao ou iu ie üe er an en in un ün ang eng ing ong',
            wholes: 'zhi chi shi ri zi ci si yi wu yu yue yuan yin yun ying',
            tones: '1 2 3 4'
        })

        this.pinyin = require('../public/phonetics.json');

        this.trie = {};
        this.pinyin.phonetics.forEach((r: string[]) => r.forEach((s: string) => {
            let ptr: any = this.trie;
            for (let i=0; i<s.length; i++) {
                ptr = ptr[s[i]] = ptr[s[i]] || {};
            }
        }));

        this._syllables = [].concat(...this.pinyin.phonetics);
        this._dictionary = require('../public/hanzi.json');
        this._characters = Object.keys(this._dictionary).sort((a,b)=>{return this._dictionary[a].id - this._dictionary[b].id});
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
