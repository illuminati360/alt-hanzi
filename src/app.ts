import * as MRE from '@microsoft/mixed-reality-extension-sdk';
import { Transform, Vector2 } from '@microsoft/mixed-reality-extension-sdk';
import { CellData, GridMenu } from './GUI/gridMenu';
import { PinyinDatabase } from './database';
import { getGltf, joinUrl } from './utils';

const PINYIN_INFO_PLACE_HOLDER = 'Awaiting Input';
const PINYIN_INFO_ERROR_MESSAGE = 'No Such Syllable';

/**
 * The main class of this app. All the logic goes here.
 */
export default class Hanzi {
    private context: MRE.Context;
    private assets: MRE.AssetContainer;
    private baseUrl: string;

    private root: MRE.Actor;
    private prefabs: Map<number, MRE.Prefab>;

    private pinyinDatabase: PinyinDatabase;

    private pinyinSound: MRE.Sound;
    private sprite: any;

    private pinyinInfoText: string = '';

    // scene
    private scenes: Array<[string, GridMenu[]]> = [];
    private currentScene: string = '';

    // main_menu scene
    private mainMenu: GridMenu;

    // pinyin_menu
    private pinyinMenu: GridMenu;
    private pinyinHead: GridMenu;
    private pinyinTone: GridMenu;
    private pinyinMenuControlStrip: GridMenu;
    private pinyinInfoPanel: GridMenu;

    // phonetics table
    private phoneticsTable: GridMenu;

    // radicals
    private radicals: GridMenu;

    // commonly used
    private commonHanziMenu: GridMenu;

    // hanzi input
    private hanzi: GridMenu;

    // constructor
	constructor(private _context: MRE.Context, private params: MRE.ParameterSet, _baseUrl: string) {
        this.context = _context;
        this.baseUrl = _baseUrl;
        this.assets = new MRE.AssetContainer(this.context);

        this.prefabs = new Map<number, MRE.Prefab>();

        this.context.onStarted(() => this.init());
    }
    
    private init() {
        // data
        this.loadData();
        this.loadSounds();

        this.createRoot();
        // menus for main_menu scene
        this.createMainMenu();

        // menus for pinyin_menu scene
        this.createPinyinMenu();
        this.createPinyinHead();
        this.createPinyinTone();
        this.createPinyinMenuControlStrip();
        this.createPinyinInfoPanel();

        // menus for phonetics_table scene
        // this.createPhoneticsTable();

        // menus for common_hanzi_menu scene
        this.createCommonHanziMenu();

        // scenes
        this.scenes.push(['main_menu', [this.mainMenu]]);
        this.scenes.push(['pinyin_menu', [this.pinyinMenu, this.pinyinMenuControlStrip, this.pinyinHead, this.pinyinTone, this.pinyinInfoPanel]]);
        // this.scenes.push(['phonetics_table', [this.phoneticsTable]]);
        this.scenes.push(['common_hanzi_menu', [this.commonHanziMenu]]);

        // hide menus on game start up
        this.switchScene('main_menu');
    }

    private loadData(){
        this.pinyinDatabase = new PinyinDatabase();
    }

    private loadSounds(){
        this.pinyinSound = this.assets.createSound('joined', { uri: `${this.baseUrl}/pinyin.ogg` });
        this.sprite = require('../public/sprite.json');
    }

    private createRoot(){
        this.root = MRE.Actor.Create(this.context, {
            actor:{ 
                transform: { 
                    local: { position: {x: 0, y: 0, z: 0} }
                }
            },
        });
    }

    private createMainMenu(){
        const MAIN_MENU_ITEMS = ['pinyin', 'phonetics', 'radicals', 'common', 'writer'];
        const MAIN_MENU_CELL_WIDTH = 0.3;
        const MAIN_MENU_CELL_HEIGHT = 0.1;
        const MAIN_MENU_CELL_DEPTH = 0.005;
        const MAIN_MENU_CELL_MARGIN = 0.01;
        const MAIN_MENU_CELL_SCALE = 1;

        // mainmenu button
        let mainMenuMeshId = this.assets.createBoxMesh('main_menu_btn_mesh', MAIN_MENU_CELL_WIDTH, MAIN_MENU_CELL_HEIGHT, MAIN_MENU_CELL_DEPTH).id;
        let mainMenuDefaultMaterialId = this.assets.createMaterial('main_menu_default_btn_material', { color: MRE.Color3.LightGray() }).id;

        let data = MAIN_MENU_ITEMS.map(t => [{
            text: t
        }]);
        this.mainMenu = new GridMenu(this.context, {
            // logic
            title: 'Main Menu',
            data,
            shape: {
                row: MAIN_MENU_ITEMS.length,
                col: 1
            },
            // assets
            meshId: mainMenuMeshId,
            defaultMaterialId: mainMenuDefaultMaterialId,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: 0,
                y: 0
            },
            // dimensions
            margin: MAIN_MENU_CELL_MARGIN,
            box: {
                width: MAIN_MENU_CELL_WIDTH,
                height: MAIN_MENU_CELL_HEIGHT,
                depth: MAIN_MENU_CELL_DEPTH,
                scale: MAIN_MENU_CELL_SCALE
            },
        });

        this.mainMenu.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'main_menu') { return; }
            let row = coord.x;
            switch(row){
                case MAIN_MENU_ITEMS.indexOf('pinyin'):
                    this.switchScene('pinyin_menu');
                    break;
                case MAIN_MENU_ITEMS.indexOf('phonetics'):
                    // this.switchScene('phonetics_table');
                    break;
                case MAIN_MENU_ITEMS.indexOf('common'):
                    this.switchScene('common_hanzi_menu');
                    break;
                case MAIN_MENU_ITEMS.indexOf('writer'):
                    this.spawnItem(0);
                    break;
            }
        });
    }

    private createPinyinMenu(){
        const PINYIN_MENU_DIMENSIONS = new Vector2(6, 12);
        const PINYIN_MENU_CELL_WIDTH = 0.2;
        const PINYIN_MENU_CELL_HEIGHT = 0.2;
        const PINYIN_MENU_CELL_DEPTH = 0.005;
        const PINYIN_MENU_CELL_MARGIN = 0.010;
        const PINYIN_MENU_CELL_SCALE = 1;

        let pinyinMenuMeshId = this.assets.createBoxMesh('pinyin_menu_btn_mesh', PINYIN_MENU_CELL_WIDTH, PINYIN_MENU_CELL_HEIGHT, PINYIN_MENU_CELL_DEPTH).id;
        let pinyinMenuDefaultMaterialId = this.assets.createMaterial('pinyin_menu_default_btn_material', { color: MRE.Color3.LightGray() }).id;
        let pinyinMenuHighlightMeshId = this.assets.createBoxMesh('pinyin_menu_highlight_mesh', PINYIN_MENU_CELL_WIDTH+PINYIN_MENU_CELL_MARGIN, PINYIN_MENU_CELL_HEIGHT+PINYIN_MENU_CELL_MARGIN, PINYIN_MENU_CELL_DEPTH/2).id;
        let pinyinMenuHighlightMaterialId = this.assets.createMaterial('pinyin_menu_highlight_btn_material', { color: MRE.Color3.Red() }).id;

        let initials = this.breakDown(this.pinyinDatabase.initials, PINYIN_MENU_DIMENSIONS.y);
        let finals = this.breakDown(this.pinyinDatabase.finals, PINYIN_MENU_DIMENSIONS.y);
        let wholes = this.breakDown(this.pinyinDatabase.wholes, PINYIN_MENU_DIMENSIONS.y);
        let rl = [...initials, ...finals, ...wholes]; // row list
        let dl = [].concat(...rl); // datum list

        let data = rl.map(r=>{
            return r.map(d=>({text: d}));
        });

        this.pinyinMenu = new GridMenu(this.context, {
            data,
            // logic
            name: 'pinyin menu',
            title: 'The Pinyin Components Table',
            shape: {
                row: PINYIN_MENU_DIMENSIONS.x,
                col: PINYIN_MENU_DIMENSIONS.y
            },
            // asset
            meshId: pinyinMenuMeshId,
            defaultMaterialId: pinyinMenuDefaultMaterialId,
            highlightMeshId: pinyinMenuHighlightMeshId,
            highlightMaterialId: pinyinMenuHighlightMaterialId,
            // control
            parentId: this.root.id,
            // dimensions
            margin: PINYIN_MENU_CELL_MARGIN,
            box: {
                width: PINYIN_MENU_CELL_WIDTH,
                height: PINYIN_MENU_CELL_HEIGHT,
                depth: PINYIN_MENU_CELL_DEPTH,
                scale: PINYIN_MENU_CELL_SCALE,
                textColor: MRE.Color3.Black(),
                textHeight: 0.07,
                textAnchor: MRE.TextAnchorLocation.MiddleCenter
            },
            highlight: {
                depth: PINYIN_MENU_CELL_DEPTH/2
            }
        });
        this.pinyinMenu.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'pinyin_menu') { return; }
            this.pinyinMenu.highlight(coord, true);
            let index = this.pinyinMenu.getHighlightedIndex(this.pinyinMenu.coord);
            this.putc(dl[index]);
        });
    }

    private createPinyinHead(){
        const PINYIN_HEAD_ITEMS = ['Initials', 'Finals', 'Wholes'];
        const PINYIN_HEAD_CELL_DEPTH = 0.005;
        const PINYIN_HEAD_CELL_MARGIN = this.pinyinMenu.margin;
        const PINYIN_HEAD_CELL_SCALE = 1;
        const PINYIN_HEAD_CELL_TEXT_HEIGHT = 0.09;

        // inventory info
        let PINYIN_HEAD_CELL_HEIGHT = this.pinyinMenu.boxHeight * 2 + this.pinyinMenu.margin;
        let PINYIN_HEAD_CELL_WIDTH = PINYIN_HEAD_CELL_HEIGHT;
        let pinyinHeadMeshId = this.assets.createBoxMesh('pinyin_head_mesh', PINYIN_HEAD_CELL_WIDTH, PINYIN_HEAD_CELL_HEIGHT, PINYIN_HEAD_CELL_DEPTH).id;
        let pinyinHeadMaterialId = this.assets.createMaterial('pinyin_head_material', { color: MRE.Color3.Teal() }).id;;

        let data = PINYIN_HEAD_ITEMS.map(d=>[{text: d}]);

        this.pinyinHead = new GridMenu(this.context, {
            data,
            // logic
            shape: {
                row: 3,
                col: 1
            },
            // assets
            meshId: pinyinHeadMeshId,
            defaultMaterialId: pinyinHeadMaterialId,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: -(PINYIN_HEAD_CELL_WIDTH+PINYIN_HEAD_CELL_MARGIN),
                y: 0
            },
            // dimensions
            box: {
                width: PINYIN_HEAD_CELL_WIDTH,
                height: PINYIN_HEAD_CELL_HEIGHT,
                depth: PINYIN_HEAD_CELL_DEPTH,
                scale: PINYIN_HEAD_CELL_SCALE,
                textHeight: PINYIN_HEAD_CELL_TEXT_HEIGHT
            },
            margin: PINYIN_HEAD_CELL_MARGIN,
        });
    }

    private createPinyinTone(){
        const PINYIN_TONE_ITEMS = [ '1', '2', '3', '4'];
        const PINYIN_TONE_CELL_WIDTH = 0.2;
        const PINYIN_TONE_CELL_HEIGHT = 0.2;
        const PINYIN_TONE_CELL_DEPTH = 0.005;
        const PINYIN_TONE_CELL_MARGIN = 0.010;
        const PINYIN_TONE_CELL_SCALE = 1;
        const PINYIN_TONE_CELL_TEXT_HEIGHT = 0.09;

        // inventory info
        let pinyinToneMeshId = this.assets.createBoxMesh('pinyin_tone_mesh', PINYIN_TONE_CELL_WIDTH, PINYIN_TONE_CELL_HEIGHT, PINYIN_TONE_CELL_DEPTH).id;
        let pinyinToneMaterialId = this.assets.createMaterial('pinyin_tone_material', { color: MRE.Color3.Teal() }).id;;
        let pinyinToneHighlightMeshId = this.assets.createBoxMesh('pinyin_tone_highlight_mesh', PINYIN_TONE_CELL_WIDTH+PINYIN_TONE_CELL_MARGIN, PINYIN_TONE_CELL_HEIGHT+PINYIN_TONE_CELL_MARGIN, PINYIN_TONE_CELL_DEPTH/2).id;
        let pinyinToneHighlightMaterialId = this.assets.createMaterial('pinyin_tone_highlight_btn_material', { color: MRE.Color3.Red() }).id;

        let data = [ PINYIN_TONE_ITEMS.map((d=>({text: d}))) ];

        this.pinyinTone = new GridMenu(this.context, {
            data,
            // logic
            shape: {
                row: 1,
                col: 4
            },
            // assets
            meshId: pinyinToneMeshId,
            defaultMaterialId: pinyinToneMaterialId,
            highlightMeshId: pinyinToneHighlightMeshId,
            highlightMaterialId: pinyinToneHighlightMaterialId,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: 0,
                y: -(PINYIN_TONE_CELL_HEIGHT + PINYIN_TONE_CELL_MARGIN)
            },
            // dimensions
            box: {
                width: PINYIN_TONE_CELL_WIDTH,
                height: PINYIN_TONE_CELL_HEIGHT,
                depth: PINYIN_TONE_CELL_DEPTH,
                scale: PINYIN_TONE_CELL_SCALE,
                textHeight: PINYIN_TONE_CELL_TEXT_HEIGHT
            },
            margin: PINYIN_TONE_CELL_MARGIN,
        });
        this.pinyinTone.addBehavior((coord: Vector2, name: string, user: MRE.User)=>{
            if (this.currentScene != 'pinyin_menu') { return; }
            this.pinyinTone.highlight(coord);
        });
    }

    private createPinyinMenuControlStrip(){
        const PINYIN_MENU_CONTROL_ITEMS = ['Backspace', 'Clear', 'Enter', 'Back'];
        const PINYIN_MENU_CONTROL_CELL_WIDTH = 0.3;
        const PINYIN_MENU_CONTROL_CELL_HEIGHT = this.pinyinTone.boxHeight;
        const PINYIN_MENU_CONTROL_CELL_DEPTH = 0.0005;
        const PINYIN_MENU_CONTROL_CELL_MARGIN = 0.0075;
        const PINYIN_MENU_CONTROL_CELL_SCALE = 1;
        const PINYIN_MENU_CONTROL_CELL_TEXT_HEIGHT = 0.05;

        let pinyinMenuControlMeshId = this.assets.createBoxMesh('pinyin_menu_control_btn_mesh', PINYIN_MENU_CONTROL_CELL_WIDTH, PINYIN_MENU_CONTROL_CELL_HEIGHT, PINYIN_MENU_CONTROL_CELL_DEPTH).id;
        let pinyinMenuControlDefaultMaterialId = this.assets.createMaterial('pinyin_menu_control_default_btn_material', { color: MRE.Color3.DarkGray() }).id;

        let data = [ PINYIN_MENU_CONTROL_ITEMS.map(t => ({
            text: t
        })) ];

        this.pinyinMenuControlStrip = new GridMenu(this.context, {
            // logic
            data,
            shape: {
                row: 1,
                col: PINYIN_MENU_CONTROL_ITEMS.length
            },
            // assets
            meshId: pinyinMenuControlMeshId,
            defaultMaterialId: pinyinMenuControlDefaultMaterialId,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: this.pinyinTone.getMenuSize().width + this.pinyinTone.margin,
                y: -(this.pinyinTone.margin + PINYIN_MENU_CONTROL_CELL_HEIGHT)
            },
            // dimensions
            margin: PINYIN_MENU_CONTROL_CELL_MARGIN,
            box: {
                width: PINYIN_MENU_CONTROL_CELL_WIDTH,
                height: PINYIN_MENU_CONTROL_CELL_HEIGHT,
                depth: PINYIN_MENU_CONTROL_CELL_DEPTH,
                scale: PINYIN_MENU_CONTROL_CELL_SCALE,
                textHeight: PINYIN_MENU_CONTROL_CELL_TEXT_HEIGHT,
                textColor: MRE.Color3.White()
            },
        });
        this.pinyinMenuControlStrip.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'pinyin_menu') { return; }
            let col = coord.y;
            switch(col){
                case PINYIN_MENU_CONTROL_ITEMS.indexOf('Backspace'):
                    this.putc('Backspace')
                    break;
                case PINYIN_MENU_CONTROL_ITEMS.indexOf('Clear'):
                    this.putc('Clear')
                    break;
                case PINYIN_MENU_CONTROL_ITEMS.indexOf('Enter'):
                    this.putc('Enter')
                    break;
                case PINYIN_MENU_CONTROL_ITEMS.indexOf('Back'):
                    this.switchScene('main_menu')
                    break;
            }
        });
    }

    private createPinyinInfoPanel(){
        const PINYIN_INFO_CELL_HEIGHT = 0.2;
        const PINYIN_INFO_CELL_DEPTH = 0.005;
        const PINYIN_INFO_CELL_MARGIN = 0.005;
        const PINYIN_INFO_CELL_SCALE = 1;
        const PINYIN_INFO_CELL_TEXT_HEIGHT = 0.09;

        // inventory info
        const w = this.pinyinTone.getMenuSize().width + this.pinyinTone.margin + this.pinyinMenuControlStrip.getMenuSize().width;
        const PINYIN_INFO_CELL_WIDTH = w;
        let pinyinInfoMeshId = this.assets.createBoxMesh('pinyin_info_mesh', PINYIN_INFO_CELL_WIDTH, PINYIN_INFO_CELL_HEIGHT, PINYIN_INFO_CELL_DEPTH).id;
        let pinyinInfoMaterialId = this.assets.createMaterial('pinyin_info_material', { color: MRE.Color3.White() }).id;;

        let data = [[{text: PINYIN_INFO_PLACE_HOLDER}]];

        this.pinyinInfoPanel = new GridMenu(this.context, {
            data,
            // logic
            shape: {
                row: 1,
                col: 1
            },
            // assets
            meshId: pinyinInfoMeshId,
            defaultMaterialId: pinyinInfoMaterialId,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: 0,
                y: -(this.pinyinTone.margin + this.pinyinTone.getMenuSize().height + PINYIN_INFO_CELL_MARGIN + PINYIN_INFO_CELL_HEIGHT)
            },
            // dimensions
            box: {
                width: PINYIN_INFO_CELL_WIDTH,
                height: PINYIN_INFO_CELL_HEIGHT,
                depth: PINYIN_INFO_CELL_DEPTH,
                scale: PINYIN_INFO_CELL_SCALE,
                textHeight: PINYIN_INFO_CELL_TEXT_HEIGHT
            },
            margin: PINYIN_INFO_CELL_MARGIN,
        });
    }

    private createPhoneticsTable(){
        const PHONETICS_TABLE_DIMENSIONS = new Vector2(this.pinyinDatabase.rowNum+1, this.pinyinDatabase.colNum+1);
        const PHONETICS_TABLE_CELL_WIDTH = 0.035;
        const PHONETICS_TABLE_CELL_HEIGHT = 0.035;
        const PHONETICS_TABLE_CELL_DEPTH = 0.005;
        const PHONETICS_TABLE_CELL_MARGIN = 0.003;
        const PHONETICS_TABLE_CELL_SCALE = 1;

        let phoneticsTableMeshId = this.assets.createBoxMesh('phonetics_table_btn_mesh', PHONETICS_TABLE_CELL_WIDTH, PHONETICS_TABLE_CELL_HEIGHT, PHONETICS_TABLE_CELL_DEPTH).id;
        let phoneticsTableDefaultMaterialId = this.assets.createMaterial('phonetics_table_default_btn_material', { color: MRE.Color3.LightGray() }).id;
        let phoneticsTableHighlightMeshId = this.assets.createBoxMesh('phonetics_table_highlight_mesh', PHONETICS_TABLE_CELL_WIDTH+PHONETICS_TABLE_CELL_MARGIN, PHONETICS_TABLE_CELL_HEIGHT+PHONETICS_TABLE_CELL_MARGIN, PHONETICS_TABLE_CELL_DEPTH/2).id;
        let phoneticsTableHighlightMaterialId = this.assets.createMaterial('phonetics_table_highlight_btn_material', { color: MRE.Color3.Red() }).id;
        let phoneticsTablePlaneMeshId = this.assets.createPlaneMesh('plane_mesh', PHONETICS_TABLE_CELL_WIDTH, PHONETICS_TABLE_CELL_HEIGHT).id;
        let phoneticsTablePlaneBodyMaterial = this.assets.createMaterial('body_btn_material', { color: MRE.Color3.LightGray() });
        let phoneticsTablePlaneHeadMaterial = this.assets.createMaterial('head_btn_material', { color: MRE.Color3.Teal() });

        let head = [ '', ...this.pinyinDatabase.cols ];
        let body = this.pinyinDatabase.phonetics.map((d: string[],i: number) => {return [this.pinyinDatabase.rows[i], ...d]});
        let data = [ head, ...body ].map((r, i)=>{
            if (i==0){ // first row?
                return r.map((d: CellData)=>({text: d, material: phoneticsTablePlaneHeadMaterial}));
            }else{
                return r.map(((d: CellData, i: number)=>(
                    (i==0) ? {text: d, material: phoneticsTablePlaneHeadMaterial} : {text: d}
                )))
            }
        });

        this.phoneticsTable = new GridMenu(this.context, {
            data,
            // logic
            name: 'phonetics table',
            title: 'The Pinyin Phonetics Table',
            shape: {
                row: PHONETICS_TABLE_DIMENSIONS.x,
                col: PHONETICS_TABLE_DIMENSIONS.y
            },
            // asset
            meshId: phoneticsTableMeshId,
            defaultMaterialId: phoneticsTableDefaultMaterialId,
            highlightMeshId: phoneticsTableHighlightMeshId,
            highlightMaterialId: phoneticsTableHighlightMaterialId,
            planeMeshId: phoneticsTablePlaneMeshId,
            defaultPlaneMaterial: phoneticsTablePlaneBodyMaterial,
            // control
            parentId: this.root.id,
            // dimensions
            margin: PHONETICS_TABLE_CELL_MARGIN,
            box: {
                width: PHONETICS_TABLE_CELL_WIDTH,
                height: PHONETICS_TABLE_CELL_HEIGHT,
                depth: PHONETICS_TABLE_CELL_DEPTH,
                scale: PHONETICS_TABLE_CELL_SCALE,
                textColor: MRE.Color3.Black(),
                textHeight: 0.01,
                textAnchor: MRE.TextAnchorLocation.MiddleCenter
            },
            highlight: {
                depth: PHONETICS_TABLE_CELL_DEPTH/2
            }
        });
        this.phoneticsTable.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'phonetcis_table') { return; }
            this.phoneticsTable.highlight(coord);
        });
    }

    private createCommonHanziMenu(){
        const COMMON_HANZI_MENU_DIMENSIONS = new Vector2(8, 8);
        const COMMON_HANZI_MENU_CELL_WIDTH = 0.1;
        const COMMON_HANZI_MENU_CELL_HEIGHT = 0.1;
        const COMMON_HANZI_MENU_CELL_DEPTH = 0.005;
        const COMMON_HANZI_MENU_CELL_MARGIN = 0.003;
        const COMMON_HANZI_MENU_CELL_SCALE = 1;

        let commonHanziMenuMeshId = this.assets.createBoxMesh('common_hanzi_menu_btn_mesh', COMMON_HANZI_MENU_CELL_WIDTH, COMMON_HANZI_MENU_CELL_HEIGHT, COMMON_HANZI_MENU_CELL_DEPTH).id;
        let commonHanziMenuDefaultMaterialId = this.assets.createMaterial('common_hanzi_menu_default_btn_material', { color: MRE.Color3.LightGray() }).id;
        let commonHanziMenuHighlightMeshId = this.assets.createBoxMesh('common_hanzi_menu_highlight_mesh', COMMON_HANZI_MENU_CELL_WIDTH+COMMON_HANZI_MENU_CELL_MARGIN, COMMON_HANZI_MENU_CELL_HEIGHT+COMMON_HANZI_MENU_CELL_MARGIN, COMMON_HANZI_MENU_CELL_DEPTH/2).id;
        let commonHanziMenuHighlightMaterialId = this.assets.createMaterial('common_hanzi_menu_highlight_btn_material', { color: MRE.Color3.Red() }).id;
        let commonHanziMenuPlaneMeshId = this.assets.createPlaneMesh('common_hanzi_menu_plane_mesh', COMMON_HANZI_MENU_CELL_WIDTH, COMMON_HANZI_MENU_CELL_HEIGHT).id;
        let commonHanziMenuPlaneDefaultMaterial = this.assets.createMaterial('common_hanzi_menu_plane_material', { color: MRE.Color3.DarkGray() });

        this.commonHanziMenu = new GridMenu(this.context, {
            // logic
            name: 'commnon hanzi menu',
            title: '2497 Common Hanzi Characters',
            shape: {
                row: COMMON_HANZI_MENU_DIMENSIONS.x,
                col: COMMON_HANZI_MENU_DIMENSIONS.y
            },
            // asset
            meshId: commonHanziMenuMeshId,
            defaultMaterialId: commonHanziMenuDefaultMaterialId,
            highlightMeshId: commonHanziMenuHighlightMeshId,
            highlightMaterialId: commonHanziMenuHighlightMaterialId,
            planeMeshId: commonHanziMenuPlaneMeshId,
            defaultPlaneMaterial: commonHanziMenuPlaneDefaultMaterial,
            // control
            parentId: this.root.id,
            // dimensions
            margin: COMMON_HANZI_MENU_CELL_MARGIN,
            box: {
                width: COMMON_HANZI_MENU_CELL_WIDTH,
                height: COMMON_HANZI_MENU_CELL_HEIGHT,
                depth: COMMON_HANZI_MENU_CELL_DEPTH,
                scale: COMMON_HANZI_MENU_CELL_SCALE,
                textColor: MRE.Color3.Black(),
                textHeight: 0.01,
                textAnchor: MRE.TextAnchorLocation.MiddleCenter
            },
            highlight: {
                depth: COMMON_HANZI_MENU_CELL_DEPTH/2
            },
            plane: {
                width: COMMON_HANZI_MENU_CELL_WIDTH,
                height: COMMON_HANZI_MENU_CELL_HEIGHT
            },
        });
        this.commonHanziMenu.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'common_hanzi_menu') { return; }
            this.commonHanziMenu.highlight(coord);
        });
    }

    private switchScene(scene: string){
        if (this.currentScene == scene){
            return;
        }
        // default scene
        if (!this.currentScene.length && !this.scenes.map(e=>e[0]).includes(scene)) {
            scene = 'main_menu';
        }
        this.currentScene = scene;
        // disable other scenes first
        let tv: GridMenu[] = [];
        this.scenes.forEach((e)=>{
            let k = e[0]; let v = e[1];
            v.forEach(m => {
                if (k != scene){
                    m.disable();
                }
                else{
                    tv = v;
                }
            });
        });
        // then enable current scene
        setTimeout(()=>{
            tv.forEach(m => {
                m.enable();
            })
        }, 1000);
    }

    ////////////////
    // utils
    private height(arr: string[], width: number){
        return Math.floor(arr.length / width) + (arr.length % width ? 1 : 0);
    }
    private breakDown(arr: string[], width: number){
        const h = this.height(arr, width);
        const ret = [];
        for (var i=0; i < h-1; i++) {
          ret.push( arr.slice( i*width, (i+1)*width ) );
        }
        ret.push( arr.slice( (i)*width ).concat(Array(h*width-arr.length).fill('')) );
        return ret;
    }

    /////////////////
    // actions
    private putc(c: string){
        var error = false;
        
        switch(c){
        case 'Backspace':
            this.pinyinInfoText = this.pinyinInfoText.slice(0,-1);
            break;
        case 'Clear':
            this.pinyinInfoText = '';
            this.pinyinMenu.highlight(this.pinyinMenu.coord, false);
            break;
        case 'Enter':
            if ( this.pinyinInfoText && this.pinyinDatabase.syllables.includes(this.pinyinInfoText) ){
                let tone = (this.pinyinTone.highlighted) ? (this.pinyinTone.coord.y+1).toString() : '';
                this.playSound(this.pinyinInfoText.replace('ü','v') + tone);
                console.log(this.pinyinInfoText.replace('ü','v')+tone);
            }
            else{
                error = true;
            }
            this.pinyinInfoText = '';
            this.pinyinMenu.highlight(this.pinyinMenu.coord, false);
            break;
        default:
            this.pinyinInfoText += c;
            if ( !this.pinyinDatabase.find(this.pinyinInfoText) ) {
                error = true;
                this.pinyinInfoText = '';
                this.pinyinMenu.highlight(this.pinyinMenu.coord, false);
            }
        }

        this.updatePinyinInfoPanel( (this.pinyinInfoText ? this.pinyinInfoText : (error ? PINYIN_INFO_ERROR_MESSAGE : PINYIN_INFO_PLACE_HOLDER) ) );
    }

    private updatePinyinInfoPanel(text: string){
        this.pinyinInfoPanel.updateCells([[{text: text}]]);
    }

    private playSound(text: string){        
        let s = this.sprite[text];
        if (s === undefined) return;
        let m = this.root.startSound(this.pinyinSound.id, {
            volume: 0.5,
            rolloffStartDistance: 100,
            time: parseInt(s[0])/1000
        });

        setTimeout(()=>{
          m.stop();
        }, parseInt(s[1]));
    }

    private async loadGltf(id: number, uri: string){
        let url = joinUrl(this.baseUrl +'/', uri);
        if (!this.prefabs.has(id)){
            let obj = await getGltf(url);
            // let dim = gltfBoundingBox.computeBoundings(obj);
            // let dim = {dimensions: {width: 0, height: 0, depth: 0}, center: {x: 0, y: 0, z: 0} };
            
            await this.assets.loadGltf(url)
                .then(assets => {
                    this.prefabs.set(id, assets.find(a => a.prefab !== null) as MRE.Prefab);
                    // this.dimensions.set(id, dim);
                })
                .catch(e => MRE.log.info("app", e));
        }
        return this.prefabs.get(id);
    }
    private async spawnItem(index: number){
        let uri = 'models/25105.gltf'
        let prefab = await this.loadGltf(index, uri);
        let actor = MRE.Actor.CreateFromPrefab(this.context, {
            prefabId: prefab.id,
            actor: {
                collider: { 
                    geometry: { shape: MRE.ColliderType.Box },
                    layer: MRE.CollisionLayer.Hologram
                },
                appearance: {
                    enabled: true
                },
                transform:{
                    local: {
                        scale: {x: 1, y: 1, z: 1}
                    }
                },
                grabbable: true
            }
        });
    }
}
