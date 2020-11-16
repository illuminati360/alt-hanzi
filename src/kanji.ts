import fs from 'fs';
import path from 'path';
import * as MRE from '@microsoft/mixed-reality-extension-sdk';
import { MreArgumentError, Vector2 } from '@microsoft/mixed-reality-extension-sdk';
import { CellData, GridMenu } from './GUI/gridMenu';
import { PinyinDatabase, levelData, KanjiDatabase, KanaType } from './database';
import { checkUserName, fetchJSON, getGltf, joinUrl, lineBreak } from './utils';
import { NumberInput } from './GUI/NumberInput';

const OWNER_NAME = process.env['OWNER_NAME'];
const THUMBNAILS_BASE_URL = "https://raw.githubusercontent.com/illuminati360/alt-kanji-data/master/thumbnails/";
const MODELS_BASE_URL = "https://raw.githubusercontent.com/illuminati360/alt-kanji-data/master/models/";

const KANJI_MODEL_SCALE = 0.0001*8;
const KANJI_MODEL_ROTATION = MRE.Quaternion.FromEulerAngles(0 * MRE.DegreesToRadians, 0 * MRE.DegreesToRadians, 0 * MRE.DegreesToRadians);

const SCALE_STEP = 0.025/1000;

const gltfBoundingBox = require('gltf-bounding-box');

type BoundingBoxDimensions = {
    dimensions: {
        width: number,
        height: number,
        depth: number
    },
    center: {
        x: number,
        y: number,
        z: number
    }
}

/**
 * The main class of this app. All the logic goes here.
 */
export default class Kanji {
    private context: MRE.Context;
    private assets: MRE.AssetContainer;
    private baseUrl: string;

    private root: MRE.Actor;
    private home: MRE.Actor;
    private textures: Map<string, MRE.Texture>;
    private materials: Map<string, MRE.Material>;
    private prefabs: Map<string, MRE.Prefab>;
    private dimensions: Map<string, BoundingBoxDimensions>;
    private highlightBoxes: Map<MRE.Actor, MRE.Actor>;
    private spawnedKanji: Map<MRE.Actor, string>;

    private defaultPlaneMaterial: MRE.Material;

    private kanjiDatabase: KanjiDatabase;
    private kanji: string[];

    private kanaSound: MRE.Sound;
    private sprite: any;
    private boundingBoxMaterial: MRE.Material;
    private invisibleMaterial: MRE.Material;

    private currentKanaType: KanaType = KanaType.HIRA;
    private highlightedActor: MRE.Actor;

    // scene
    private scenes: Array<[string, GridMenu[]]> = [];
    private currentScene: string = '';

    // main_menu scene
    private mainMenu: GridMenu;

    // gojuon_menu
    private gojuonMenu: GridMenu;
    private gojuonMenuHeadTop: GridMenu;
    private gojuonMenuHeadLeft: GridMenu;
    private gojuonMenuControlStrip: GridMenu;
    private gojuonInfoPanel: GridMenu;

    // dakuon_menu
    private dakuonMenu: GridMenu;
    private dakuonMenuHeadLeft: GridMenu;

    // youon_menu
    private youonMenu: GridMenu;
    private youonMenuHeadLeft: GridMenu;

    // kanji_menu
    private kanjiMenu: GridMenu;
    private kanjiInfoPanel: GridMenu;
    private kanjiMenuControlStrip: GridMenu;
    private numberInput: NumberInput;

    // constructor
	constructor(private _context: MRE.Context, private params: MRE.ParameterSet, _baseUrl: string) {
        this.context = _context;
        this.baseUrl = _baseUrl;
        this.assets = new MRE.AssetContainer(this.context);

        this.boundingBoxMaterial = this.assets.createMaterial('bounding_box_material', { color: MRE.Color4.FromColor3(MRE.Color3.Red(), 0.4), alphaMode: MRE.AlphaMode.Blend} )
        this.invisibleMaterial = this.assets.createMaterial('bounding_box_material', { color: MRE.Color4.FromColor3(MRE.Color3.Red(), 0), alphaMode: MRE.AlphaMode.Blend} )

        this.defaultPlaneMaterial = this.assets.createMaterial('bounding_box_material', { color: MRE.Color4.FromColor3(MRE.Color3.White())} )

        this.textures = new Map<string, MRE.Texture>();
        this.materials = new Map<string, MRE.Material>();
        this.highlightBoxes = new Map<MRE.Actor, MRE.Actor>();
        this.spawnedKanji = new Map<MRE.Actor, string>();

        this.prefabs = new Map<string, MRE.Prefab>();
        this.dimensions = new Map<string, BoundingBoxDimensions>();

        this.context.onStarted(() => this.init());
    }
    
    private init() {
        // data
        this.loadData();
        this.loadSounds();

        // root actor
        this.createRoot();
        // home button
        this.createHomeButton();

        // menus for main_menu scene
        this.createMainMenu();

        // menus for kanji_menu scene
        this.createKanjiMenu();
        this.createKanjiInfoPanel();
        this.createKanjiMenuControlStrip();
        this.updateKanjiMenu( this.getKanjiPageData() );

        // number input
        this.createNumberInput(); // depends on kanji menu's width

        // menus for gojuon_menu scene
        this.createGojuonMenu();
        this.createGojuonHeadTop();
        this.createGojuonHeadLeft();
        this.createGojuonInfoPanel();
        this.createGojuonMenuControlStrip(); // depends on number input's width
        this.updateGojuonMenuData(this.currentKanaType);

        // menus for dakuon_menu scene
        this.createDakuonMenu();
        this.createDakuonHeadLeft();
        this.updateDakuonMenuData(this.currentKanaType);

        // menus for youon_menu scene
        this.createYouonMenu();
        this.createYouonHeadLeft();

        // scenes
        this.scenes.push(['main_menu', [this.mainMenu]]);
        this.scenes.push(['gojuon_menu', [this.gojuonMenu, this.gojuonMenuHeadTop, this.gojuonMenuHeadLeft, this.gojuonInfoPanel, this.gojuonMenuControlStrip, this.numberInput]]);
        this.scenes.push(['dakuon_menu', [this.dakuonMenu, this.dakuonMenuHeadLeft, this.gojuonInfoPanel, this.gojuonMenuControlStrip, this.numberInput]]);
        this.scenes.push(['youon_menu', [this.youonMenu, this.youonMenuHeadLeft]]);
        this.scenes.push(['kanji_menu', [this.kanjiMenu, this.kanjiMenuControlStrip, this.kanjiInfoPanel, this.kanjiMenuControlStrip, this.numberInput]]);

        // hide menus on game start up
        this.switchScene('main_menu');
    }

    private loadData(){
        this.kanjiDatabase = new KanjiDatabase();
        this.kanji = this.kanjiDatabase.kanji;
    }

    private loadSounds(){
        this.kanaSound = this.assets.createSound('kana', { uri: `${this.baseUrl}/kana.ogg` });
        this.sprite = require('../public/json/kana_sprite.json');
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

    private createHomeButton(){
        const RADIUS = 0.02;
        this.home = MRE.Actor.CreatePrimitive(this.assets, {
            definition: {
                shape: MRE.PrimitiveShape.Sphere,
                dimensions: {x: RADIUS, y: RADIUS, z: RADIUS}
            },
            addCollider: true,
            actor: {
                name: 'home_button',
                parentId: this.root.id,
                transform: {
                    local: {
                        position: {x: -RADIUS, y: -RADIUS, z: 0},
                        scale: {x: 1, y: 1, z: 1}
                    }
                },
                appearance: {
                    enabled: true,
                    materialId: this.assets.createMaterial('home_button_material', { color: MRE.Color3.LightGray()}).id
                }
            },
        });
        let buttonBehavior = this.home.setBehavior(MRE.ButtonBehavior);
        buttonBehavior.onClick((user,__)=>{
            if(checkUserName(user, OWNER_NAME)){
                this.switchScene('main_menu');
            }
        });
    }

    private createMainMenu(){
        const MAIN_MENU_ITEMS = ['gojuon', 'dakuon', 'youon', 'kanji'];
        const MAIN_MENU_CELL_WIDTH = 0.6;
        const MAIN_MENU_CELL_HEIGHT = 0.2;
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
                scale: MAIN_MENU_CELL_SCALE,
                textHeight: 0.1,
            },
        });

        this.mainMenu.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'main_menu') { return; }
            let row = coord.x;
            switch(row){
                case MAIN_MENU_ITEMS.indexOf('gojuon'):
                    var h1 = this.gojuonMenuControlStrip.getMenuSize().height + this.gojuonMenuControlStrip.margin;
                    var h2 = this.gojuonInfoPanel.getMenuSize().height + this.gojuonInfoPanel.margin;
                    var y = -(h1 + h2 + this.numberInput.margin + this.numberInput.boxHeight)
                    this.numberInput.positionMenu({x: 0, y});
                    this.switchScene('gojuon_menu');
                    break;
                case MAIN_MENU_ITEMS.indexOf('dakuon'):
                    var h1 = this.gojuonMenuControlStrip.getMenuSize().height + this.gojuonMenuControlStrip.margin;
                    var h2 = this.gojuonInfoPanel.getMenuSize().height + this.gojuonInfoPanel.margin;
                    var y = -(h1 + h2 + this.numberInput.margin + this.numberInput.boxHeight)
                    this.numberInput.positionMenu({x: 0, y});
                    this.switchScene('dakuon_menu');
                    break;
                case MAIN_MENU_ITEMS.indexOf('youon'):
                    this.switchScene('youon_menu');
                    break;
                case MAIN_MENU_ITEMS.indexOf('kanji'):
                    var h1 = this.kanjiMenuControlStrip.getMenuSize().height + this.kanjiMenuControlStrip.margin;
                    var h2 = this.kanjiInfoPanel.getMenuSize().height + this.kanjiInfoPanel.margin;
                    var y = -(h1 + h2 + this.numberInput.margin + this.numberInput.boxHeight)
                    this.numberInput.positionMenu({x: 0, y});
                    this.switchScene('kanji_menu');
                    break;
            }
        });
    }

    private createGojuonMenu(){
        const GOJUON_MENU_CELL_WIDTH = 0.2;
        const GOJUON_MENU_CELL_HEIGHT = 0.2;
        const GOJUON_MENU_CELL_DEPTH = 0.005;
        const GOJUON_MENU_CELL_MARGIN = 0.010;
        const GOJUON_MENU_CELL_SCALE = 1;

        let gojuonMenuMeshId = this.assets.createBoxMesh('gojuon_menu_btn_mesh', GOJUON_MENU_CELL_WIDTH, GOJUON_MENU_CELL_HEIGHT, GOJUON_MENU_CELL_DEPTH).id;
        let gojuonMenuDefaultMaterialId = this.assets.createMaterial('gojuon_menu_default_btn_material', { color: MRE.Color3.LightGray() }).id;
        let gojuonMenuHighlightMeshId = this.assets.createBoxMesh('gojuon_menu_highlight_mesh', GOJUON_MENU_CELL_WIDTH+GOJUON_MENU_CELL_MARGIN, GOJUON_MENU_CELL_HEIGHT+GOJUON_MENU_CELL_MARGIN, GOJUON_MENU_CELL_DEPTH/2).id;
        let gojuonMenuHighlightMaterialId = this.assets.createMaterial('gojuon_menu_highlight_btn_material', { color: MRE.Color3.Red() }).id;
        let gojuonMenuPlaneMeshId = this.assets.createPlaneMesh('gojuon_menu_plane_mesh', GOJUON_MENU_CELL_WIDTH, GOJUON_MENU_CELL_HEIGHT).id;
        let gojuonMenuPlaneMaterial = this.assets.createMaterial('gojuon_menu_plane_material', { color: MRE.Color3.White() });

        let initials = this.kanjiDatabase.gojuon.cols;
        let finals = this.kanjiDatabase.gojuon.rows;
        const GOJUON_MENU_DIMENSIONS = new Vector2(finals.length, initials.length);

        this.gojuonMenu = new GridMenu(this.context, {
            // logic
            name: 'gojuon menu',
            title: 'Gojuon (50 sounds)',
            shape: {
                row: GOJUON_MENU_DIMENSIONS.x,
                col: GOJUON_MENU_DIMENSIONS.y
            },
            // asset
            meshId: gojuonMenuMeshId,
            defaultMaterialId: gojuonMenuDefaultMaterialId,
            highlightMeshId: gojuonMenuHighlightMeshId,
            highlightMaterialId: gojuonMenuHighlightMaterialId,
            planeMeshId: gojuonMenuPlaneMeshId,
            defaultPlaneMaterial: gojuonMenuPlaneMaterial,
            // control
            parentId: this.root.id,
            // dimensions
            margin: GOJUON_MENU_CELL_MARGIN,
            box: {
                width: GOJUON_MENU_CELL_WIDTH,
                height: GOJUON_MENU_CELL_HEIGHT,
                depth: GOJUON_MENU_CELL_DEPTH,
                scale: GOJUON_MENU_CELL_SCALE,
                textColor: MRE.Color3.Black(),
                textHeight: 0.07,
                textAnchor: MRE.TextAnchorLocation.MiddleCenter
            },
            plane: {
                width: GOJUON_MENU_CELL_WIDTH,
                height: GOJUON_MENU_CELL_HEIGHT
            },
            highlight: {
                depth: GOJUON_MENU_CELL_DEPTH/2
            }
        });
        this.gojuonMenu.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'gojuon_menu') { return; }
            this.gojuonMenu.highlight(coord, true);
            let row = this.gojuonMenu.coord.x;
            let col = this.gojuonMenu.coord.y;
            let d = this.kanjiDatabase.gojuon.kana[row][col];
            this.playSound(d[KanaType.ROMA]);
            this.updateGojuonInfoPanel(d[this.currentKanaType]);
        });
    }

    private createGojuonHeadTop(){
        let initials = this.kanjiDatabase.gojuon.cols;
        const GOJUON_HEAD_TOP_ITEMS = initials;
        const GOJUON_HEAD_TOP_CELL_WIDTH = this.gojuonMenu.boxWidth;
        const GOJUON_HEAD_TOP_CELL_HEIGHT = this.gojuonMenu.boxHeight;
        const GOJUON_HEAD_TOP_CELL_MARGIN = this.gojuonMenu.margin;
        const GOJUON_HEAD_TOP_CELL_DEPTH = 0.005;
        const GOJUON_HEAD_TOP_CELL_SCALE = 1;
        const GOJUON_HEAD_TOP_CELL_TEXT_HEIGHT = 0.09;

        let gojuonHeadTopMeshId = this.assets.createBoxMesh('gojuon_head_mesh', GOJUON_HEAD_TOP_CELL_WIDTH, GOJUON_HEAD_TOP_CELL_HEIGHT, GOJUON_HEAD_TOP_CELL_DEPTH).id;
        let gojuonHeadTopMaterialId = this.assets.createMaterial('gojuon_head_material', { color: MRE.Color3.Teal() }).id;;

        let data = [GOJUON_HEAD_TOP_ITEMS.map((d: string)=>({text: d}))];
        this.gojuonMenuHeadTop = new GridMenu(this.context, {
            data,
            // logic
            shape: {
                row: 1,
                col: GOJUON_HEAD_TOP_ITEMS.length
            },
            // assets
            meshId: gojuonHeadTopMeshId,
            defaultMaterialId: gojuonHeadTopMaterialId,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: 0,
                y: this.gojuonMenu.getMenuSize().height + GOJUON_HEAD_TOP_CELL_MARGIN
            },
            // dimensions
            box: {
                width: GOJUON_HEAD_TOP_CELL_WIDTH,
                height: GOJUON_HEAD_TOP_CELL_HEIGHT,
                depth: GOJUON_HEAD_TOP_CELL_DEPTH,
                scale: GOJUON_HEAD_TOP_CELL_SCALE,
                textHeight: GOJUON_HEAD_TOP_CELL_TEXT_HEIGHT
            },
            margin: GOJUON_HEAD_TOP_CELL_MARGIN,
        });
    }

    private createGojuonHeadLeft(){
        let finals = this.kanjiDatabase.gojuon.rows;
        const GOJUON_HEAD_LEFT_ITEMS = ['', ...finals];
        const GOJUON_HEAD_LEFT_CELL_WIDTH = this.gojuonMenu.boxWidth;
        const GOJUON_HEAD_LEFT_CELL_HEIGHT = this.gojuonMenu.boxHeight;
        const GOJUON_HEAD_LEFT_CELL_MARGIN = this.gojuonMenu.margin;
        const GOJUON_HEAD_LEFT_CELL_DEPTH = 0.005;
        const GOJUON_HEAD_LEFT_CELL_SCALE = 1;
        const GOJUON_HEAD_LEFT_CELL_TEXT_HEIGHT = 0.09;

        let gojuonHeadLeftMeshId = this.assets.createBoxMesh('gojuon_head_mesh', GOJUON_HEAD_LEFT_CELL_WIDTH, GOJUON_HEAD_LEFT_CELL_HEIGHT, GOJUON_HEAD_LEFT_CELL_DEPTH).id;
        let gojuonHeadLeftMaterialId = this.assets.createMaterial('gojuon_head_material', { color: MRE.Color3.Teal() }).id;;

        let data = GOJUON_HEAD_LEFT_ITEMS.map( d=>[{text: d}] );
        this.gojuonMenuHeadLeft = new GridMenu(this.context, {
            data,
            // logic
            shape: {
                row: GOJUON_HEAD_LEFT_ITEMS.length,
                col: 1
            },
            // assets
            meshId: gojuonHeadLeftMeshId,
            defaultMaterialId: gojuonHeadLeftMaterialId,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: -(GOJUON_HEAD_LEFT_CELL_WIDTH+GOJUON_HEAD_LEFT_CELL_MARGIN),
                y: 0
            },
            // dimensions
            box: {
                width: GOJUON_HEAD_LEFT_CELL_WIDTH,
                height: GOJUON_HEAD_LEFT_CELL_HEIGHT,
                depth: GOJUON_HEAD_LEFT_CELL_DEPTH,
                scale: GOJUON_HEAD_LEFT_CELL_SCALE,
                textHeight: GOJUON_HEAD_LEFT_CELL_TEXT_HEIGHT
            },
            margin: GOJUON_HEAD_LEFT_CELL_MARGIN,
        });
    }

    private createGojuonInfoPanel(){
        const GOJUON_INFO_CELL_HEIGHT = this.gojuonMenu.boxWidth*3 + this.gojuonMenu.margin*2;
        const GOJUON_INFO_CELL_DEPTH = 0.005;
        const GOJUON_INFO_CELL_MARGIN = 0.005;
        const GOJUON_INFO_CELL_SCALE = 1;
        const GOJUON_INFO_CELL_TEXT_HEIGHT = 0.09;

        const GOJUON_INFO_PLANE_HEIGHT = GOJUON_INFO_CELL_HEIGHT;
        const GOJUON_INFO_PLANE_WIDTH = GOJUON_INFO_CELL_HEIGHT;

        let w = this.gojuonMenu.getMenuSize().width;
        const GOJUON_INFO_CELL_WIDTH = w;
        let gojuonInfoMeshId = this.assets.createBoxMesh('gojuon_info_mesh', GOJUON_INFO_CELL_WIDTH, GOJUON_INFO_CELL_HEIGHT, GOJUON_INFO_CELL_DEPTH).id;
        let gojuonInfoMaterialId = this.assets.createMaterial('gojuon_info_material', { color: MRE.Color3.White() }).id;;
        let gojuonInfoPlaneMeshId = this.assets.createPlaneMesh('gojuon_info_plane_mesh', GOJUON_INFO_PLANE_WIDTH, GOJUON_INFO_PLANE_HEIGHT).id;
        let gojuonInfoPlaneMaterial = this.assets.createMaterial('gojuon_info_material', { color: MRE.Color3.LightGray()});

        let data = [[{text: ''}]];

        this.gojuonInfoPanel = new GridMenu(this.context, {
            data,
            // logic
            shape: {
                row: 1,
                col: 1
            },
            // assets
            meshId: gojuonInfoMeshId,
            defaultMaterialId: gojuonInfoMaterialId,
            planeMeshId: gojuonInfoPlaneMeshId,
            defaultPlaneMaterial: gojuonInfoPlaneMaterial,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: 0,
                y: -(GOJUON_INFO_CELL_HEIGHT + GOJUON_INFO_CELL_MARGIN)
            },
            // dimensions
            box: {
                width: GOJUON_INFO_CELL_WIDTH,
                height: GOJUON_INFO_CELL_HEIGHT,
                depth: GOJUON_INFO_CELL_DEPTH,
                scale: GOJUON_INFO_CELL_SCALE,
                textHeight: GOJUON_INFO_CELL_TEXT_HEIGHT
            },
            plane: {
                width: GOJUON_INFO_CELL_HEIGHT,
                height: GOJUON_INFO_CELL_WIDTH
            },
            margin: GOJUON_INFO_CELL_MARGIN,
        });
        this.gojuonInfoPanel.planesAlignLeft();
        this.gojuonInfoPanel.labelsRightToPlane();
    }

    private createGojuonMenuControlStrip(){
        const GOJUON_MENU_CONTROL_ITEMS = ['Hiragana', 'Katakana', 'Romanization','Spawn', 'Delete'];
        const GOJUON_MENU_CONTROL_CELL_MARGIN = 0.0075;
        const GOJUON_MENU_CONTROL_CELL_WIDTH = (this.numberInput.getMenuSize().width + GOJUON_MENU_CONTROL_CELL_MARGIN)/GOJUON_MENU_CONTROL_ITEMS.length - GOJUON_MENU_CONTROL_CELL_MARGIN;
        const GOJUON_MENU_CONTROL_CELL_HEIGHT = this.gojuonMenu.boxHeight;
        const GOJUON_MENU_CONTROL_CELL_DEPTH = 0.0005;
        const GOJUON_MENU_CONTROL_CELL_SCALE = 1;
        const GOJUON_MENU_CONTROL_CELL_TEXT_HEIGHT = 0.04;

        let gojuonMenuControlMeshId = this.assets.createBoxMesh('gojuon_menu_control_btn_mesh', GOJUON_MENU_CONTROL_CELL_WIDTH, GOJUON_MENU_CONTROL_CELL_HEIGHT, GOJUON_MENU_CONTROL_CELL_DEPTH).id;
        let gojuonMenuControlDefaultMaterialId = this.assets.createMaterial('gojuon_menu_control_default_btn_material', { color: MRE.Color3.DarkGray() }).id;

        let data = [ GOJUON_MENU_CONTROL_ITEMS.map(t => ({
            text: t
        })) ];

        this.gojuonMenuControlStrip = new GridMenu(this.context, {
            // logic
            data,
            shape: {
                row: 1,
                col: GOJUON_MENU_CONTROL_ITEMS.length
            },
            // assets
            meshId: gojuonMenuControlMeshId,
            defaultMaterialId: gojuonMenuControlDefaultMaterialId,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: 0,
                y: -(this.gojuonInfoPanel.getMenuSize().height + this.gojuonInfoPanel.margin + GOJUON_MENU_CONTROL_CELL_HEIGHT + GOJUON_MENU_CONTROL_CELL_MARGIN)
            },
            // dimensions
            margin: GOJUON_MENU_CONTROL_CELL_MARGIN,
            box: {
                width: GOJUON_MENU_CONTROL_CELL_WIDTH,
                height: GOJUON_MENU_CONTROL_CELL_HEIGHT,
                depth: GOJUON_MENU_CONTROL_CELL_DEPTH,
                scale: GOJUON_MENU_CONTROL_CELL_SCALE,
                textHeight: GOJUON_MENU_CONTROL_CELL_TEXT_HEIGHT,
                textColor: MRE.Color3.White()
            },
        });
        this.gojuonMenuControlStrip.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'gojuon_menu' && this.currentScene != 'dakuon_menu') { return; }
            let col = coord.y;
            switch(col){
                case GOJUON_MENU_CONTROL_ITEMS.indexOf('Hiragana'):
                    this.currentKanaType = KanaType.HIRA;
                    if (this.currentScene == 'gojuon_menu'){
                        this.updateGojuonMenuData(this.currentKanaType);
                    }else{
                        this.updateDakuonMenuData(this.currentKanaType);
                    }
                    break;
                case GOJUON_MENU_CONTROL_ITEMS.indexOf('Katakana'):
                    this.currentKanaType = KanaType.KATA;
                    if (this.currentScene == 'gojuon_menu'){
                        this.updateGojuonMenuData(this.currentKanaType);
                    }else{
                        this.updateDakuonMenuData(this.currentKanaType);
                    }
                    break;
                case GOJUON_MENU_CONTROL_ITEMS.indexOf('Romanization'):
                    this.currentKanaType = KanaType.ROMA;
                    if (this.currentScene == 'gojuon_menu'){
                        this.updateGojuonMenuData(this.currentKanaType);
                    }else{
                        this.updateDakuonMenuData(this.currentKanaType);
                    }
                    break;
                case GOJUON_MENU_CONTROL_ITEMS.indexOf('Spawn'):
                    let row: number; let col: number;
                    let d: any;
                    if (this.currentScene == 'gojuon_menu'){
                        row = this.gojuonMenu.coord.x;
                        col = this.gojuonMenu.coord.y;
                        d = this.kanjiDatabase.gojuon.kana[row][col];
                    }else{
                        row = this.dakuonMenu.coord.x;
                        col = this.dakuonMenu.coord.y;
                        d = this.kanjiDatabase.dakuon.kana[row][col];
                    }
                    if (this.currentKanaType != KanaType.ROMA) this.spawnItem(d[this.currentKanaType]);
                    break;
                case GOJUON_MENU_CONTROL_ITEMS.indexOf('Delete'):
                    if (this.highlightedActor != null){
                        this.deleteItem(this.highlightedActor);
                    }
                    break
            }
        });
    }

    private createDakuonMenu(){
        let initials = this.kanjiDatabase.dakuon.rows;
        let finals = this.kanjiDatabase.dakuon.cols;
        const DAKUON_MENU_DIMENSIONS = new Vector2(initials.length, finals.length);

        const DAKUON_MENU_CELL_MARGIN = 0.010;
        const DAKUON_MENU_CELL_WIDTH = (this.gojuonInfoPanel.getMenuSize().width + DAKUON_MENU_CELL_MARGIN)/DAKUON_MENU_DIMENSIONS.y - DAKUON_MENU_CELL_MARGIN;
        const DAKUON_MENU_CELL_HEIGHT = DAKUON_MENU_CELL_WIDTH;
        const DAKUON_MENU_CELL_DEPTH = 0.005;
        const DAKUON_MENU_CELL_SCALE = 1;

        let dakuonMenuMeshId = this.assets.createBoxMesh('dakuon_menu_btn_mesh', DAKUON_MENU_CELL_WIDTH, DAKUON_MENU_CELL_HEIGHT, DAKUON_MENU_CELL_DEPTH).id;
        let dakuonMenuDefaultMaterialId = this.assets.createMaterial('dakuon_menu_default_btn_material', { color: MRE.Color3.LightGray() }).id;
        let dakuonMenuHighlightMeshId = this.assets.createBoxMesh('dakuon_menu_highlight_mesh', DAKUON_MENU_CELL_WIDTH+DAKUON_MENU_CELL_MARGIN, DAKUON_MENU_CELL_HEIGHT+DAKUON_MENU_CELL_MARGIN, DAKUON_MENU_CELL_DEPTH/2).id;
        let dakuonMenuHighlightMaterialId = this.assets.createMaterial('dakuon_menu_highlight_btn_material', { color: MRE.Color3.Red() }).id;
        let dakuonMenuPlaneMeshId = this.assets.createPlaneMesh('dakuon_menu_plane_mesh', DAKUON_MENU_CELL_WIDTH, DAKUON_MENU_CELL_HEIGHT).id;
        let dakuonMenuPlaneMaterial = this.assets.createMaterial('dakuon_menu_plane_material', { color: MRE.Color3.White() });

        this.dakuonMenu = new GridMenu(this.context, {
            // logic
            name: 'dakuon menu',
            title: 'Dakuon',
            shape: {
                row: DAKUON_MENU_DIMENSIONS.x,
                col: DAKUON_MENU_DIMENSIONS.y
            },
            // asset
            meshId: dakuonMenuMeshId,
            defaultMaterialId: dakuonMenuDefaultMaterialId,
            highlightMeshId: dakuonMenuHighlightMeshId,
            highlightMaterialId: dakuonMenuHighlightMaterialId,
            planeMeshId: dakuonMenuPlaneMeshId,
            defaultPlaneMaterial: dakuonMenuPlaneMaterial,
            // control
            parentId: this.root.id,
            // dimensions
            margin: DAKUON_MENU_CELL_MARGIN,
            box: {
                width: DAKUON_MENU_CELL_WIDTH,
                height: DAKUON_MENU_CELL_HEIGHT,
                depth: DAKUON_MENU_CELL_DEPTH,
                scale: DAKUON_MENU_CELL_SCALE,
                textColor: MRE.Color3.Black(),
                textHeight: 0.07,
                textAnchor: MRE.TextAnchorLocation.MiddleCenter
            },
            plane: {
                width: DAKUON_MENU_CELL_WIDTH,
                height: DAKUON_MENU_CELL_HEIGHT
            },
            highlight: {
                depth: DAKUON_MENU_CELL_DEPTH/2
            }
        });
        this.dakuonMenu.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'dakuon_menu') { return; }
            this.dakuonMenu.highlight(coord, true);
            let row = this.dakuonMenu.coord.x;
            let col = this.dakuonMenu.coord.y;
            let d = this.kanjiDatabase.dakuon.kana[row][col];
            this.playSound(d[KanaType.ROMA]);
            this.updateGojuonInfoPanel(d[this.currentKanaType]);
        });
    }

    private createDakuonHeadLeft(){
        let initials = this.kanjiDatabase.dakuon.rows;
        const DAKUON_HEAD_LEFT_ITEMS = initials;
        const DAKUON_HEAD_LEFT_CELL_WIDTH = this.dakuonMenu.boxWidth;
        const DAKUON_HEAD_LEFT_CELL_HEIGHT = this.dakuonMenu.boxHeight;
        const DAKUON_HEAD_LEFT_CELL_MARGIN = this.dakuonMenu.margin;
        const DAKUON_HEAD_LEFT_CELL_DEPTH = 0.005;
        const DAKUON_HEAD_LEFT_CELL_SCALE = 1;
        const DAKUON_HEAD_LEFT_CELL_TEXT_HEIGHT = 0.035;

        let dakuonHeadLeftMeshId = this.assets.createBoxMesh('dakuon_head_left_mesh', DAKUON_HEAD_LEFT_CELL_WIDTH, DAKUON_HEAD_LEFT_CELL_HEIGHT, DAKUON_HEAD_LEFT_CELL_DEPTH).id;
        let dakuonHeadLeftMaterialId = this.assets.createMaterial('dakuon_head_left_material', { color: MRE.Color3.Teal() }).id;;

        let data = DAKUON_HEAD_LEFT_ITEMS.map( (d:any)=>[{text: d}] );
        this.dakuonMenuHeadLeft = new GridMenu(this.context, {
            data,
            // logic
            shape: {
                row: DAKUON_HEAD_LEFT_ITEMS.length,
                col: 1
            },
            // assets
            meshId: dakuonHeadLeftMeshId,
            defaultMaterialId: dakuonHeadLeftMaterialId,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: -(DAKUON_HEAD_LEFT_CELL_WIDTH+DAKUON_HEAD_LEFT_CELL_MARGIN),
                y: 0
            },
            // dimensions
            box: {
                width: DAKUON_HEAD_LEFT_CELL_WIDTH,
                height: DAKUON_HEAD_LEFT_CELL_HEIGHT,
                depth: DAKUON_HEAD_LEFT_CELL_DEPTH,
                scale: DAKUON_HEAD_LEFT_CELL_SCALE,
                textHeight: DAKUON_HEAD_LEFT_CELL_TEXT_HEIGHT
            },
            margin: DAKUON_HEAD_LEFT_CELL_MARGIN,
        });
    }

    private createYouonMenu(){
        const YOUON_MENU_CELL_WIDTH = 0.2;
        const YOUON_MENU_CELL_HEIGHT = 0.1;
        const YOUON_MENU_CELL_DEPTH = 0.005;
        const YOUON_MENU_CELL_MARGIN = 0.010;
        const YOUON_MENU_CELL_SCALE = 1;
        const YOUON_MENU_TEXT_HEIGHT = 0.035;

        let youonMenuMeshId = this.assets.createBoxMesh('youon_menu_btn_mesh', YOUON_MENU_CELL_WIDTH, YOUON_MENU_CELL_HEIGHT, YOUON_MENU_CELL_DEPTH).id;
        let youonMenuDefaultMaterialId = this.assets.createMaterial('youon_menu_default_btn_material', { color: MRE.Color3.LightGray() }).id;
        let youonMenuHighlightMeshId = this.assets.createBoxMesh('youon_menu_highlight_mesh', YOUON_MENU_CELL_WIDTH+YOUON_MENU_CELL_MARGIN, YOUON_MENU_CELL_HEIGHT+YOUON_MENU_CELL_MARGIN, YOUON_MENU_CELL_DEPTH/2).id;
        let youonMenuHighlightMaterialId = this.assets.createMaterial('youon_menu_highlight_btn_material', { color: MRE.Color3.Red() }).id;

        let initials = this.kanjiDatabase.youon.rows;
        let finals = this.kanjiDatabase.youon.cols;
        const YOUON_MENU_DIMENSIONS = new Vector2(initials.length, finals.length);

        let kana = this.kanjiDatabase.youon.kana;
        let data = kana.map((r: any) => r.map((k: any) => {
            if (k[KanaType.ROMA] === undefined) return {text: ''}
            return { text: k[KanaType.ROMA] }
        }));
        this.youonMenu = new GridMenu(this.context, {
            data,
            // logic
            name: 'youon menu',
            title: 'Youon',
            shape: {
                row: YOUON_MENU_DIMENSIONS.x,
                col: YOUON_MENU_DIMENSIONS.y
            },
            // asset
            meshId: youonMenuMeshId,
            defaultMaterialId: youonMenuDefaultMaterialId,
            highlightMeshId: youonMenuHighlightMeshId,
            highlightMaterialId: youonMenuHighlightMaterialId,
            // control
            parentId: this.root.id,
            // dimensions
            margin: YOUON_MENU_CELL_MARGIN,
            box: {
                width: YOUON_MENU_CELL_WIDTH,
                height: YOUON_MENU_CELL_HEIGHT,
                depth: YOUON_MENU_CELL_DEPTH,
                scale: YOUON_MENU_CELL_SCALE,
                textColor: MRE.Color3.Black(),
                textHeight: YOUON_MENU_TEXT_HEIGHT,
                textAnchor: MRE.TextAnchorLocation.MiddleCenter
            },
            highlight: {
                depth: YOUON_MENU_CELL_DEPTH/2
            }
        });
        this.youonMenu.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'youon_menu') { return; }
            this.youonMenu.highlight(coord, true);
            let index = this.youonMenu.getHighlightedIndex(this.youonMenu.coord);
            let row = this.youonMenu.coord.x;
            let col = this.youonMenu.coord.y;
            let d = this.kanjiDatabase.youon.kana[row][col];
            this.playSound(d[KanaType.ROMA]);
        });
    }

    private createYouonHeadLeft(){
        let initials = this.kanjiDatabase.youon.rows;
        const YOUON_HEAD_LEFT_ITEMS = initials;
        const YOUON_HEAD_LEFT_CELL_WIDTH = this.youonMenu.boxWidth;
        const YOUON_HEAD_LEFT_CELL_HEIGHT = this.youonMenu.boxHeight;
        const YOUON_HEAD_LEFT_CELL_MARGIN = this.youonMenu.margin;
        const YOUON_HEAD_LEFT_CELL_DEPTH = 0.005;
        const YOUON_HEAD_LEFT_CELL_SCALE = 1;
        const YOUON_HEAD_LEFT_CELL_TEXT_HEIGHT = 0.04;

        let youonHeadLeftMeshId = this.assets.createBoxMesh('youon_head_left_mesh', YOUON_HEAD_LEFT_CELL_WIDTH, YOUON_HEAD_LEFT_CELL_HEIGHT, YOUON_HEAD_LEFT_CELL_DEPTH).id;
        let youonHeadLeftMaterialId = this.assets.createMaterial('youon_head_left_material', { color: MRE.Color3.Teal() }).id;;

        let data = YOUON_HEAD_LEFT_ITEMS.map( (d:any)=>[{text: d}] );
        this.youonMenuHeadLeft = new GridMenu(this.context, {
            data,
            // logic
            shape: {
                row: YOUON_HEAD_LEFT_ITEMS.length,
                col: 1
            },
            // assets
            meshId: youonHeadLeftMeshId,
            defaultMaterialId: youonHeadLeftMaterialId,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: -(YOUON_HEAD_LEFT_CELL_WIDTH+YOUON_HEAD_LEFT_CELL_MARGIN),
                y: 0
            },
            // dimensions
            box: {
                width: YOUON_HEAD_LEFT_CELL_WIDTH,
                height: YOUON_HEAD_LEFT_CELL_HEIGHT,
                depth: YOUON_HEAD_LEFT_CELL_DEPTH,
                scale: YOUON_HEAD_LEFT_CELL_SCALE,
                textHeight: YOUON_HEAD_LEFT_CELL_TEXT_HEIGHT
            },
            margin: YOUON_HEAD_LEFT_CELL_MARGIN,
        });
    }

    private createKanjiMenu(){
        const KANJI_MENU_DIMENSIONS = new Vector2(8, 8);
        const KANJI_MENU_CELL_WIDTH = 0.2;
        const KANJI_MENU_CELL_HEIGHT = 0.2;
        const KANJI_MENU_CELL_DEPTH = 0.005;
        const KANJI_MENU_CELL_MARGIN = 0.01;
        const KANJI_MENU_CELL_SCALE = 1;

        let kanjiMenuMeshId = this.assets.createBoxMesh('kanji_menu_btn_mesh', KANJI_MENU_CELL_WIDTH, KANJI_MENU_CELL_HEIGHT, KANJI_MENU_CELL_DEPTH).id;
        let kanjiMenuDefaultMaterialId = this.assets.createMaterial('kanji_menu_default_btn_material', { color: MRE.Color3.LightGray() }).id;
        let kanjiMenuHighlightMeshId = this.assets.createBoxMesh('kanji_menu_highlight_mesh', KANJI_MENU_CELL_WIDTH+KANJI_MENU_CELL_MARGIN, KANJI_MENU_CELL_HEIGHT+KANJI_MENU_CELL_MARGIN, KANJI_MENU_CELL_DEPTH/2).id;
        let kanjiMenuHighlightMaterialId = this.assets.createMaterial('kanji_menu_highlight_btn_material', { color: MRE.Color3.Red() }).id;
        let kanjiMenuPlaneMeshId = this.assets.createPlaneMesh('kanji_menu_plane_mesh', KANJI_MENU_CELL_WIDTH, KANJI_MENU_CELL_HEIGHT).id;
        let kanjiMenuPlaneDefaultMaterial = this.assets.createMaterial('kanji_menu_plane_material', { color: MRE.Color3.DarkGray() });

        this.kanjiMenu = new GridMenu(this.context, {
            // logic
            name: 'common kanji menu',
            title: '2136 Common Kanji',
            shape: {
                row: KANJI_MENU_DIMENSIONS.x,
                col: KANJI_MENU_DIMENSIONS.y
            },
            // asset
            meshId: kanjiMenuMeshId,
            defaultMaterialId: kanjiMenuDefaultMaterialId,
            highlightMeshId: kanjiMenuHighlightMeshId,
            highlightMaterialId: kanjiMenuHighlightMaterialId,
            planeMeshId: kanjiMenuPlaneMeshId,
            defaultPlaneMaterial: kanjiMenuPlaneDefaultMaterial,
            // control
            parentId: this.root.id,
            // dimensions
            margin: KANJI_MENU_CELL_MARGIN,
            box: {
                width: KANJI_MENU_CELL_WIDTH,
                height: KANJI_MENU_CELL_HEIGHT,
                depth: KANJI_MENU_CELL_DEPTH,
                scale: KANJI_MENU_CELL_SCALE,
                textColor: MRE.Color3.Black(),
                textHeight: 0.008,
                textAnchor: MRE.TextAnchorLocation.TopLeft
            },
            highlight: {
                depth: KANJI_MENU_CELL_DEPTH/2
            },
            plane: {
                width: KANJI_MENU_CELL_WIDTH,
                height: KANJI_MENU_CELL_HEIGHT
            },
        });
        this.kanjiMenu.offsetLabels({x: -KANJI_MENU_CELL_WIDTH/2, y: KANJI_MENU_CELL_HEIGHT/2});
        this.kanjiMenu.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'kanji_menu') { return; }
            this.kanjiMenu.highlight(coord);
            let index = this.kanjiMenu.getHighlightedIndex(this.kanjiMenu.coord);
            let char = this.kanji[index];
            this.updateKanjiInfoPanel(char);
        });
    }

    private createKanjiInfoPanel(){
        const KANJI_INFO_CELL_HEIGHT = this.kanjiMenu.boxWidth*3 + this.kanjiMenu.margin*2;
        const KANJI_INFO_CELL_DEPTH = 0.005;
        const KANJI_INFO_CELL_MARGIN = 0.005;
        const KANJI_INFO_CELL_SCALE = 1;
        const KANJI_INFO_CELL_TEXT_HEIGHT = 0.045;

        const KANJI_INFO_PLANE_HEIGHT = KANJI_INFO_CELL_HEIGHT;
        const KANJI_INFO_PLANE_WIDTH = KANJI_INFO_PLANE_HEIGHT;

        // inventory info
        const w = this.kanjiMenu.getMenuSize().width;
        const KANJI_INFO_CELL_WIDTH = w;
        let kanjiInfoMeshId = this.assets.createBoxMesh('kanji_info_mesh', KANJI_INFO_CELL_WIDTH, KANJI_INFO_CELL_HEIGHT, KANJI_INFO_CELL_DEPTH).id;
        let kanjiInfoMaterialId = this.assets.createMaterial('kanji_info_material', { color: MRE.Color3.White() }).id;;
        let kanjiInfoPlaneMeshId = this.assets.createPlaneMesh('kanji_info_plane_mesh', KANJI_INFO_PLANE_WIDTH, KANJI_INFO_PLANE_HEIGHT).id;
        let kanjiInfoPlaneMaterial = this.assets.createMaterial('kanji_info_material', { color: MRE.Color3.LightGray()});

        let data = [[{text: ''}]];

        this.kanjiInfoPanel = new GridMenu(this.context, {
            data,
            // logic
            shape: {
                row: 1,
                col: 1
            },
            // assets
            meshId: kanjiInfoMeshId,
            defaultMaterialId: kanjiInfoMaterialId,
            planeMeshId: kanjiInfoPlaneMeshId,
            defaultPlaneMaterial: kanjiInfoPlaneMaterial,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: 0,
                y: -(KANJI_INFO_CELL_HEIGHT + KANJI_INFO_CELL_MARGIN)
            },
            // dimensions
            box: {
                width: KANJI_INFO_CELL_WIDTH,
                height: KANJI_INFO_CELL_HEIGHT,
                depth: KANJI_INFO_CELL_DEPTH,
                scale: KANJI_INFO_CELL_SCALE,
                textHeight: KANJI_INFO_CELL_TEXT_HEIGHT
            },
            plane: {
                width: KANJI_INFO_PLANE_WIDTH,
                height: KANJI_INFO_PLANE_HEIGHT
            },
            margin: KANJI_INFO_CELL_MARGIN,
        });
        this.kanjiInfoPanel.planesAlignLeft();
        this.kanjiInfoPanel.labelsRightToPlane();
    }

    private createKanjiMenuControlStrip(){
        const KANJI_MENU_CONTROL_ITEMS = ['Search', 'Goto', 'Prev', 'Next', 'Spawn', 'Delete', 'Save', 'Load', 'Clear'];
        const KANJI_MENU_CONTROL_CELL_MARGIN = 0.0075;
        const KANJI_MENU_CONTROL_CELL_WIDTH = (this.kanjiMenu.getMenuSize().width + KANJI_MENU_CONTROL_CELL_MARGIN)/KANJI_MENU_CONTROL_ITEMS.length - KANJI_MENU_CONTROL_CELL_MARGIN;
        const KANJI_MENU_CONTROL_CELL_HEIGHT = this.kanjiMenu.boxHeight;
        const KANJI_MENU_CONTROL_CELL_DEPTH = 0.0005;
        const KANJI_MENU_CONTROL_CELL_SCALE = 1;
        const KANJI_MENU_CONTROL_CELL_TEXT_HEIGHT = 0.04;

        let kanjiMenuControlMeshId = this.assets.createBoxMesh('kanji_menu_control_btn_mesh', KANJI_MENU_CONTROL_CELL_WIDTH, KANJI_MENU_CONTROL_CELL_HEIGHT, KANJI_MENU_CONTROL_CELL_DEPTH).id;
        let kanjiMenuControlDefaultMaterialId = this.assets.createMaterial('kanji_menu_control_default_btn_material', { color: MRE.Color3.DarkGray() }).id;

        let data = [ KANJI_MENU_CONTROL_ITEMS.map(t => ({
            text: t
        })) ];

        this.kanjiMenuControlStrip = new GridMenu(this.context, {
            // logic
            data,
            shape: {
                row: 1,
                col: KANJI_MENU_CONTROL_ITEMS.length
            },
            // assets
            meshId: kanjiMenuControlMeshId,
            defaultMaterialId: kanjiMenuControlDefaultMaterialId,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: 0,
                y: -(this.kanjiInfoPanel.getMenuSize().height + this.kanjiInfoPanel.margin + KANJI_MENU_CONTROL_CELL_HEIGHT + KANJI_MENU_CONTROL_CELL_MARGIN)
            },
            // dimensions
            margin: KANJI_MENU_CONTROL_CELL_MARGIN,
            box: {
                width: KANJI_MENU_CONTROL_CELL_WIDTH,
                height: KANJI_MENU_CONTROL_CELL_HEIGHT,
                depth: KANJI_MENU_CONTROL_CELL_DEPTH,
                scale: KANJI_MENU_CONTROL_CELL_SCALE,
                textHeight: KANJI_MENU_CONTROL_CELL_TEXT_HEIGHT,
                textColor: MRE.Color3.White()
            },
        });
        this.kanjiMenuControlStrip.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'kanji_menu') { return; }
            let col = coord.y;
            switch(col){
                case KANJI_MENU_CONTROL_ITEMS.indexOf('Search'):
                    user.prompt("Search Kanji", true).then((dialog) => {
                        if (dialog.submitted) {
                            this.searchKanji(dialog.text);
                            this.kanjiMenu.resetPageNum();
                            this.updateKanjiMenu( this.getKanjiPageData() );
                        }
                    });
                    break;
                case KANJI_MENU_CONTROL_ITEMS.indexOf('Goto'):
                    user.prompt("Goto page", true).then((dialog) => {
                        if (dialog.submitted) {
                            let p = parseInt(dialog.text);
                            if (p!==NaN){
                                this.kanjiMenu.setPageNum(p, this.kanji.length);
                                this.updateKanjiMenu( this.getKanjiPageData() );
                            }
                        }
                    });
                    break;
                case KANJI_MENU_CONTROL_ITEMS.indexOf('Prev'):
                    this.kanjiMenu.decrementPageNum();
                    this.updateKanjiMenu( this.getKanjiPageData() );
                    break;
                case KANJI_MENU_CONTROL_ITEMS.indexOf('Next'):
                    this.kanjiMenu.incrementPageNum( this.kanji.length );
                    this.updateKanjiMenu( this.getKanjiPageData() );
                    break;
                case KANJI_MENU_CONTROL_ITEMS.indexOf('Spawn'):
                    let index = this.kanjiMenu.getHighlightedIndex(this.kanjiMenu.coord);
                    let char = this.kanji[index];
                    this.spawnItem(char);
                    break;
                case KANJI_MENU_CONTROL_ITEMS.indexOf('Delete'):
                    if (this.highlightedActor != null){
                        this.deleteItem(this.highlightedActor);
                    }
                    break;
                case KANJI_MENU_CONTROL_ITEMS.indexOf('Save'):
                    user.prompt("Save as:", true).then((dialog) => {
                        if (dialog.submitted) {
                            let filename = dialog.text;
                            this.saveLevel(filename, user);
                        }
                    });
                    break;
                case KANJI_MENU_CONTROL_ITEMS.indexOf('Load'):
                    user.prompt("Load from:", true).then((dialog) => {
                        if (dialog.submitted) {
                            let filename = dialog.text;
                            this.loadLevel(filename, user);
                        }
                    });
                    break;
                case KANJI_MENU_CONTROL_ITEMS.indexOf('Clear'):
                    user.prompt("Clear level?", false).then((dialog) => {
                        if (dialog.submitted) {
                            this.clearLevel();
                        }
                    });
                    break;
            }
        });
    }

    private createNumberInput(){
        const NUMBER_INPUT_CELL_MARGIN = 0.005;
        const NUMBER_INPUT_CELL_WIDTH = (this.kanjiMenu.getMenuSize().width + NUMBER_INPUT_CELL_MARGIN)/3 - NUMBER_INPUT_CELL_MARGIN;
        const NUMBER_INPUT_CELL_HEIGHT = 0.1;
        const NUMBER_INPUT_CELL_DEPTH = 0.005;
        const NUMBER_INPUT_CELL_SCALE = 1;
        const NUMBER_INPUT_CELL_TEXT_HEIGHT = 0.05;

        let numberInputMeshId = this.assets.createBoxMesh('number_input_btn_mesh', NUMBER_INPUT_CELL_WIDTH, NUMBER_INPUT_CELL_HEIGHT, NUMBER_INPUT_CELL_DEPTH).id;
        let numberInputMaterialId = this.assets.createMaterial('number_input_btn_material', { color: MRE.Color3.LightGray() }).id;

        this.numberInput = new NumberInput(this.context, {
            // logic
            shape: {
                row: 1,
                col: 3
            },
            // assets
            meshId: numberInputMeshId,
            defaultMaterialId: numberInputMaterialId,
            // control
            parentId: this.root.id,
            // dimensions
            box: {
                width: NUMBER_INPUT_CELL_WIDTH,
                height: NUMBER_INPUT_CELL_HEIGHT,
                depth: NUMBER_INPUT_CELL_DEPTH,
                scale: NUMBER_INPUT_CELL_SCALE,
                textHeight: NUMBER_INPUT_CELL_TEXT_HEIGHT
            },
            margin: NUMBER_INPUT_CELL_MARGIN,
        });

        this.numberInput.onIncrease(()=>{
            if (!['kanji_menu', 'gojuon_menu', 'dakuon_menu'].includes(this.currentScene)) { return; }
            if (this.highlightedActor != null){
                let box = this.highlightBoxes.get(this.highlightedActor);
                let scale = box.transform.local.scale;
                scale.x += SCALE_STEP;
                scale.y += SCALE_STEP;
                scale.z += SCALE_STEP;
                this.numberInput.updateText((scale.x/KANJI_MODEL_SCALE).toString());
            }
        });

        this.numberInput.onDecrease(()=>{
            if (!['kanji_menu', 'gojuon_menu', 'dakuon_menu'].includes(this.currentScene)) { return; }
            if (this.highlightedActor != null){
                let box = this.highlightBoxes.get(this.highlightedActor);
                let scale = box.transform.local.scale;
                scale.x -= SCALE_STEP;
                scale.y -= SCALE_STEP;
                scale.z -= SCALE_STEP;
                this.numberInput.updateText((scale.x/KANJI_MODEL_SCALE).toString());
            }
        });
        this.numberInput.onEdit((user)=>{
            if (!['kanji_menu', 'gojuon_menu', 'dakuon_menu'].includes(this.currentScene)) { return; }
            if (this.highlightedActor != null){
                user.prompt("Change scale to", true).then((dialog) => {
                    if (dialog.submitted) {
                        let int = parseInt(dialog.text)*KANJI_MODEL_SCALE;
                        if(int !== NaN){
                            let box = this.highlightBoxes.get(this.highlightedActor);
                            let scale = box.transform.local.scale;
                            scale.x = int;
                            scale.y = int;
                            scale.z = int;
                            this.numberInput.updateText((scale.x/KANJI_MODEL_SCALE).toString());
                        }
                    }
                });
            }
        })
    }
    /////////////////
    // scenes
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
        tv.forEach(m => {
            m.enable();
        })
    }

    private updateGojuonMenuData(type: KanaType){
        let data: CellData[][];
        let kana = this.kanjiDatabase.gojuon.kana;
        if (type == KanaType.ROMA){
            data = kana.map((r: any) => r.map((k: any) => {
                if (k[type] === undefined) return {text: ''}
                return { text: k[type], material: this.defaultPlaneMaterial }
            }));
        } else{
            data = kana.map((r: any) => r.map((k: any) => {
                if (k[type] === undefined) return {text: ''}
                let code = k[type].charCodeAt(0).toString();
                let url = new URL(`${code}.png`, THUMBNAILS_BASE_URL).toString();
                let material = this.loadMaterial(code, url);
                return { text: '', material }
            }));
        }
        this.gojuonMenu.updateCells(data);
    }

    private updateDakuonMenuData(type: KanaType){
        let data: CellData[][];
        let kana = this.kanjiDatabase.dakuon.kana;
        if (type == KanaType.ROMA){
            data = kana.map((r: any) => r.map((k: any) => {
                if (k[type] === undefined) return {text: ''}
                return { text: k[type] }
            }));
        } else{
            data = kana.map((r: any) => r.map((k: any) => {
                if (k[type] === undefined) return {text: ''}
                let code = k[type].charCodeAt(0).toString();
                let url = new URL(`${code}.png`, THUMBNAILS_BASE_URL).toString();
                let material = this.loadMaterial(code, url);
                return { text: '', material }
            }));
        }
        this.dakuonMenu.updateCells(data);
    }

    private getKanjiPageData(){
        let pageSize = this.kanjiMenu.row * this.kanjiMenu.col;
        return this.kanji.slice(pageSize*(this.kanjiMenu.curPageNum-1), pageSize*this.kanjiMenu.curPageNum);
    }

    private updateKanjiMenu(pageData: string[]){
        let data = pageData.map(d => {
            let code = d.charCodeAt(0).toString();
            let url = new URL(`${code}.png`, THUMBNAILS_BASE_URL).toString();
            return {
                text: parseInt(code).toString(16).toUpperCase(),
                material: this.loadMaterial(code, url)
            }
        });
        this.kanjiMenu.updateCells(this.kanjiMenu.reshape(data));
    }

    private updateGojuonInfoPanel(char: string){
        if (char === undefined) return;

        let desc = `Kana Type: ${this.currentKanaType}\nRomanization: ${this.kanjiDatabase.roma(char)}`;
        if (this.currentKanaType != KanaType.ROMA){
            let code = char.charCodeAt(0).toString();
            let url = new URL(`${code}.png`, THUMBNAILS_BASE_URL).toString();
            this.gojuonInfoPanel.updateCells([[{
                text: lineBreak(desc, 40),
                material: this.loadMaterial(code, url)
            }]]);
        }else{
            this.gojuonInfoPanel.updateCells([[{
                text: lineBreak(desc, 40)
            }]]);
        }
    }

    private updateKanjiInfoPanel(char: string){
        if (char === undefined) return;
        let code = char.charCodeAt(0).toString();
        let url = new URL(`${code}.png`, THUMBNAILS_BASE_URL).toString();
        let info = this.kanjiDatabase.dictionary[char];
        let kun = info.kun.join(',');
        let on = info.on.join(',');
        let desc = `Kun: ${info.kun.length==1?kun:'('+kun+')'}\nOn: ${info.on.length==1?on:'('+on+')'}\nEnglish: ${info.english}`;
        this.kanjiInfoPanel.updateCells([[{
            text: lineBreak(desc, 40),
            material: this.loadMaterial(code, url)
        }]]);
    }

    private playSound(text: string){
        let s = this.sprite[text];
        if (s === undefined) return;
        let m = this.root.startSound(this.kanaSound.id, {
            volume: 1,
            rolloffStartDistance: 100,
            time: parseInt(s[0])/1000
        });

        setTimeout(()=>{
          m.stop();
        }, parseInt(s[1]));
    }

    private searchKanji(search: string = ''){
        if(!search.length){
            this.kanji = this.kanjiDatabase.kanji;
        }else{
            this.kanji = this.kanjiDatabase.kanji.filter((c: string) => {
                let d = this.kanjiDatabase.dictionary[c];
                let kana = (d.kun !== undefined) ? d.kun : d.on;
                return kana.includes(search);
            });
        }
    }
    ////////////////////
    //// material
    private loadMaterial(name: string, uri: string){
        let texture;
        if (!this.textures.has('texture_'+name)){
            texture = this.assets.createTexture('texture_'+name, {uri});
            this.textures.set('texture_'+name, texture);
        }else{
            texture = this.textures.get('texture_'+name);
        }

        let material;
        if(!this.materials.has('material_'+name)){
            material = this.assets.createMaterial('material_'+name, { color: MRE.Color3.White(), mainTextureId: texture.id });
            this.materials.set('material_'+name, material);
        }else{
            material = this.materials.get('material_'+name);
        }
        return material;
    }

    private async loadGltf(char: string, uri: string){
        let url = joinUrl(this.baseUrl +'/', uri);
        if (!this.prefabs.has(char)){
            let obj = await getGltf(url);
            let dim = gltfBoundingBox.computeBoundings(obj);
            
            await this.assets.loadGltf(url)
                .then(assets => {
                    this.prefabs.set(char, assets.find(a => a.prefab !== null) as MRE.Prefab);
                    this.dimensions.set(char, dim);
                })
                .catch(e => MRE.log.info("app", e));
        }
        return this.prefabs.get(char);
    }

    private async spawnItem(char: string, _transform?: MRE.ActorTransformLike, editor: boolean = true){
        console.log('spawn', char);
        if (char === undefined) return;

        let code = char.charCodeAt(0).toString();
        let url = new URL(`${code}.glb`, MODELS_BASE_URL).toString();
        let prefab = await this.loadGltf(char, url);

        let dim = this.dimensions.get(char).dimensions;
        let center = this.dimensions.get(char).center;

        let size: any;
        switch(this.currentScene){
            case 'gojuon_menu':
                size = this.gojuonMenu.getMenuSize();
                break;
            case 'dakuon_menu':
                size = this.dakuonMenu.getMenuSize();
                break;
            case 'kanji_menu':
                size = this.kanjiMenu.getMenuSize();
                break;
        }
        let pos = {x: size.width + 0.05 + dim.width*KANJI_MODEL_SCALE/2, y: -dim.height*KANJI_MODEL_SCALE/2, z: 0};
        let transform = (_transform !== undefined) ? _transform : {
            app: {
                position: {x: pos.x, y: pos.y, z: 0}
            },
            local: {
                position: {x: pos.x, y: pos.y, z: 0},
                scale: {x: KANJI_MODEL_SCALE, y: KANJI_MODEL_SCALE, z: KANJI_MODEL_SCALE},
                rotation: KANJI_MODEL_ROTATION
            }
        }; 

        let box = MRE.Actor.CreatePrimitive(this.assets, {
            definition: {
                shape: MRE.PrimitiveShape.Box,
                dimensions: {x: dim.width, y: dim.height, z: dim.depth}
            },
            addCollider: true,
            actor: {
                name: code,
                transform,
                appearance: {
                    materialId: this.invisibleMaterial.id
                },
                collider: {
                    geometry: {
                        shape: MRE.ColliderType.Auto
                    }
                },
                grabbable: editor ? true : false
            },
        });

        // subscribe to box transform
        if (editor) box.subscribe('transform');

        let actor = MRE.Actor.CreateFromPrefab(this.context, {
            prefabId: prefab.id,
            actor: {
                parentId: box.id,
                collider: { 
                    geometry: { shape: MRE.ColliderType.Box },
                    layer: MRE.CollisionLayer.Hologram
                },
                transform:{
                    local: {
                        position: {x: center.x, y: -center.z, z: 0},
                        scale: {x: 1, y: 1, z: 1}
                    }
                },
                grabbable: editor ? true : false
            }
        });

        // remember box
        this.highlightBoxes.set(actor, box);
            
        // remember model character
        this.spawnedKanji.set(box, char);
        if (editor){
            // add behavior
            let buttonBehavior = box.setBehavior(MRE.ButtonBehavior);
            buttonBehavior.onClick((user,__)=>{
                if(checkUserName(user, OWNER_NAME)){
                    if (this.highlightedActor != actor){
                        if (this.highlightedActor != null){
                            this.highlightBoxes.get( this.highlightedActor ).appearance.material = this.invisibleMaterial;
                        }
                        box.appearance.material = this.boundingBoxMaterial;
                        this.highlightedActor = actor;
                        // wether it's a gojuon or kanji
                        let _char = this.spawnedKanji.get(box);
                        if (this.kanjiDatabase.isKanji(char)) { 
                            this.updateKanjiInfoPanel(_char);
                        }else{
                            this.updateGojuonInfoPanel(_char);
                        }
                    }else{
                        box.appearance.material = this.invisibleMaterial;
                        this.highlightedActor = null;
                    }
                }
            });
        }
    }

    private deleteItem(actor: MRE.Actor){
        let box = this.highlightBoxes.get(actor);
        box.unsubscribe('transform');

        this.spawnedKanji.delete(box);
        actor.destroy();
        if (box !== undefined) { box.destroy(); }
    }

    private saveLevel(filename: string, user: MRE.User){
        let level: levelData = [];
        this.spawnedKanji.forEach((v,k) => {
            level.push({
                char: v,
                transform: k.transform
            });
        });

        let filePath = `./public/levels/${path.basename(filename)}.json`;
        if (fs.existsSync(filePath)){
            user.prompt("File already exists, overwrite?").then((dialog) => {
                if (dialog.submitted) {
                    this.writeLevel(filePath, level, user);
                }
            });
        }
        else{
            this.writeLevel(filePath, level, user);
        }
    }

    private writeLevel(filePath: string, level: levelData, user: MRE.User){
        fs.writeFile(filePath, JSON.stringify(level), (err) => {
            if(err){ console.log(err); user.prompt("Failed")}
            else{ user.prompt("Saved"); }
        });
    }

    private async loadLevel(filename: string, user: MRE.User, editor: boolean = true){
        let relativePath = `levels/${filename}.json`
        if (!fs.existsSync(`./public/${relativePath}`)){
            user.prompt("No such file");
            return;
        }

        let filePath = `${this.baseUrl}/${relativePath}`;
        let level: levelData = await fetchJSON(filePath);
        level.forEach((d, _) => {
            this.spawnItem(d.char, d.transform, editor);
        });
    }

    private clearLevel(){
        this.highlightBoxes.forEach((_,k) => {
            this.deleteItem(k);
        })
    }
}