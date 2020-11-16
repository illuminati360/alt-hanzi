import fs from 'fs';
import path from 'path';
import * as MRE from '@microsoft/mixed-reality-extension-sdk';
import { CellData, GridMenu } from './GUI/gridMenu';
import { EngDatabase } from './database';
import { Vector2 } from '@microsoft/mixed-reality-extension-sdk';
import { NumberInput } from './GUI/NumberInput';
import { checkUserName, getGltf, joinUrl, lineBreak } from './utils';
import { Button } from './GUI/button';

const OWNER_NAME = process.env['OWNER_NAME'];
const MODELS_BASE_URL = "https://raw.githubusercontent.com/illuminati360/alt-kanji-data/master/models/";

const MODEL_SCALE = 1;
const MODEL_ROTATION = MRE.Quaternion.FromEulerAngles(0 * MRE.DegreesToRadians, 0 * MRE.DegreesToRadians, 0 * MRE.DegreesToRadians);
const RADIUS = 0.09;

const SCALE_STEP = 0.025;

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

type WordData = {
    id: number,
    info: string,
    thumbnail: string,
    model: string
}

export default class English {
    private context: MRE.Context;
    private assets: MRE.AssetContainer;
    private baseUrl: string;

    private ball: Button;
    private root: MRE.Actor;
    private home: MRE.Actor;
    private textures: Map<string, MRE.Texture>;
    private materials: Map<string, MRE.Material>;
    private prefabs: Map<number, MRE.Prefab>;
    private dimensions: Map<number, BoundingBoxDimensions>;
    private highlightBoxes: Map<MRE.Actor, MRE.Actor>;
    private spawnedKanji: Map<MRE.Actor, WordData>;

    private boundingBoxMaterial: MRE.Material;
    private invisibleMaterial: MRE.Material;

    private defaultPlaneMaterial: MRE.Material;

    private engDatabase: EngDatabase;
    private words: any;

    private highlightedActor: MRE.Actor;


    // scene
    private scenes: Array<[string, GridMenu[]]> = [];
    private currentScene: string = '';

    // main_menu scene
    private glossary: GridMenu;
    private wordInfoPanel: GridMenu;
    private glossaryControlStrip: GridMenu;
    private numberInput: NumberInput;

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
        this.spawnedKanji = new Map<MRE.Actor, WordData>();

        this.prefabs = new Map<number, MRE.Prefab>();
        this.dimensions = new Map<number, BoundingBoxDimensions>();

        this.context.onStarted(() => this.init());
    }

    private init() {
        // data
        this.loadData();

        this.createBall();

        // menus for glossary_menu scene
        this.createGlossary();
        this.createWordInfoPanel();
        this.createGlossaryControlStrip();
        this.createNumberInput();
        this.updateGlossary( this.getGlossaryPageData() );

        // scenes
        this.scenes.push(['glossary_menu', [this.glossary, this.wordInfoPanel, this.glossaryControlStrip, this.numberInput]]);
        // hide menus on game start up
        this.switchScene('glossary_menu');
    }

    private loadData(){
        this.engDatabase = new EngDatabase();
        this.words = this.engDatabase.words;
    }

    private getGlossaryPageData(){
        let pageSize = this.glossary.row * this.glossary.col;
        return this.words.slice(pageSize*(this.glossary.curPageNum-1), pageSize*this.glossary.curPageNum);
    }

    private createBall(){
        this.ball = new Button(this.context, {
            position: {x: 0, y: 0, z: 0},
            scale: {x: 1, y: 1, z: 1},
            text: '',
            enabled: true,
            meshId: this.assets.createSphereMesh('ball_mesh', RADIUS*0.7).id,
            materialId: this.assets.createMaterial('ball_material', { color: MRE.Color3.LightGray() }).id,
            layer: MRE.CollisionLayer.Hologram
        });

        this.root = MRE.Actor.Create(this.context, {
            actor:{ 
                transform: { 
                    local: { position: {x: RADIUS, y: RADIUS, z: RADIUS} }
                },
                parentId: this.ball._button.id
            }
        });
        
        // Add grab
        let button = this.ball._button;
        button.grabbable = true;
        button.onGrab('end', (user)=>{
            if (checkUserName(user, OWNER_NAME)) {
                if (this.ball._button.attachment === undefined || this.ball._button.attachment.attachPoint == 'none'){
                    this.equipBall(user);
                }
            }
        });

        this.ball.addBehavior((user,_)=>{
            user.prompt("Detach ?", false).then((dialog) => {
                if (dialog.submitted) {
                    this.unEquipBall();
                }
            });
        })

        // subscribe
        button.subscribe('transform');
    }

    private createGlossary(){
        const GLOSSARY_DIMENSIONS = new Vector2(8, 8);
        const GLOSSARY_CELL_WIDTH = 0.2;
        const GLOSSARY_CELL_HEIGHT = 0.2;
        const GLOSSARY_CELL_DEPTH = 0.005;
        const GLOSSARY_CELL_MARGIN = 0.01;
        const GLOSSARY_CELL_SCALE = 1;

        let glossaryMeshId = this.assets.createBoxMesh('glossary_btn_mesh', GLOSSARY_CELL_WIDTH, GLOSSARY_CELL_HEIGHT, GLOSSARY_CELL_DEPTH).id;
        let glossaryDefaultMaterialId = this.assets.createMaterial('glossary_default_btn_material', { color: MRE.Color3.LightGray() }).id;
        let glossaryHighlightMeshId = this.assets.createBoxMesh('glossary_highlight_mesh', GLOSSARY_CELL_WIDTH+GLOSSARY_CELL_MARGIN, GLOSSARY_CELL_HEIGHT+GLOSSARY_CELL_MARGIN, GLOSSARY_CELL_DEPTH/2).id;
        let glossaryHighlightMaterialId = this.assets.createMaterial('glossary_highlight_btn_material', { color: MRE.Color3.Red() }).id;
        let glossaryPlaneMeshId = this.assets.createPlaneMesh('glossary_plane_mesh', GLOSSARY_CELL_WIDTH, GLOSSARY_CELL_HEIGHT).id;
        let glossaryPlaneDefaultMaterial = this.assets.createMaterial('glossary_plane_material', { color: MRE.Color3.DarkGray() });

        this.glossary = new GridMenu(this.context, {
            // logic
            name: 'glossary menu',
            title: 'HELLO WORLD',
            shape: {
                row: GLOSSARY_DIMENSIONS.x,
                col: GLOSSARY_DIMENSIONS.y
            },
            // asset
            meshId: glossaryMeshId,
            defaultMaterialId: glossaryDefaultMaterialId,
            highlightMeshId: glossaryHighlightMeshId,
            highlightMaterialId: glossaryHighlightMaterialId,
            planeMeshId: glossaryPlaneMeshId,
            defaultPlaneMaterial: glossaryPlaneDefaultMaterial,
            // control
            parentId: this.root.id,
            // dimensions
            margin: GLOSSARY_CELL_MARGIN,
            box: {
                width: GLOSSARY_CELL_WIDTH,
                height: GLOSSARY_CELL_HEIGHT,
                depth: GLOSSARY_CELL_DEPTH,
                scale: GLOSSARY_CELL_SCALE,
                textColor: MRE.Color3.Black(),
                textHeight: 0.008,
                textAnchor: MRE.TextAnchorLocation.TopLeft
            },
            highlight: {
                depth: GLOSSARY_CELL_DEPTH/2
            },
            plane: {
                width: GLOSSARY_CELL_WIDTH,
                height: GLOSSARY_CELL_HEIGHT
            },
        });
        this.glossary.offsetLabels({x: -GLOSSARY_CELL_WIDTH/2, y: GLOSSARY_CELL_HEIGHT/2});
        this.glossary.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'glossary_menu') { return; }
            this.glossary.highlight(coord);
            let index = this.glossary.getHighlightedIndex(this.glossary.coord);
            let word = this.words[index];
            this.updateWordInfoPanel(word);
        });
    }

    private createWordInfoPanel(){
        const WORD_INFO_CELL_HEIGHT = this.glossary.boxWidth*3 + this.glossary.margin*2;
        const WORD_INFO_CELL_DEPTH = 0.005;
        const WORD_INFO_CELL_MARGIN = 0.005;
        const WORD_INFO_CELL_SCALE = 1;
        const WORD_INFO_CELL_TEXT_HEIGHT = 0.045;

        const WORD_INFO_PLANE_HEIGHT = WORD_INFO_CELL_HEIGHT;
        const WORD_INFO_PLANE_WIDTH = WORD_INFO_PLANE_HEIGHT;

        // inventory info
        const w = this.glossary.getMenuSize().width;
        const WORD_INFO_CELL_WIDTH = w;
        let wordInfoMeshId = this.assets.createBoxMesh('kanji_info_mesh', WORD_INFO_CELL_WIDTH, WORD_INFO_CELL_HEIGHT, WORD_INFO_CELL_DEPTH).id;
        let wordInfoMaterialId = this.assets.createMaterial('kanji_info_material', { color: MRE.Color3.White() }).id;;
        let wordInfoPlaneMeshId = this.assets.createPlaneMesh('kanji_info_plane_mesh', WORD_INFO_PLANE_WIDTH, WORD_INFO_PLANE_HEIGHT).id;
        let wordInfoPlaneMaterial = this.assets.createMaterial('kanji_info_material', { color: MRE.Color3.LightGray()});

        let data = [[{text: ''}]];

        this.wordInfoPanel = new GridMenu(this.context, {
            data,
            // logic
            shape: {
                row: 1,
                col: 1
            },
            // assets
            meshId: wordInfoMeshId,
            defaultMaterialId: wordInfoMaterialId,
            planeMeshId: wordInfoPlaneMeshId,
            defaultPlaneMaterial: wordInfoPlaneMaterial,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: 0,
                y: -(WORD_INFO_CELL_HEIGHT + WORD_INFO_CELL_MARGIN)
            },
            // dimensions
            box: {
                width: WORD_INFO_CELL_WIDTH,
                height: WORD_INFO_CELL_HEIGHT,
                depth: WORD_INFO_CELL_DEPTH,
                scale: WORD_INFO_CELL_SCALE,
                textHeight: WORD_INFO_CELL_TEXT_HEIGHT
            },
            plane: {
                width: WORD_INFO_PLANE_WIDTH,
                height: WORD_INFO_PLANE_HEIGHT
            },
            margin: WORD_INFO_CELL_MARGIN,
        });
        this.wordInfoPanel.planesAlignLeft();
        this.wordInfoPanel.labelsRightToPlane();
    }

    private createGlossaryControlStrip(){
        const GLOSSARY_CONTROL_ITEMS = ['Search', 'Goto', 'Prev', 'Next', 'Spawn', 'Delete', 'Save', 'Load', 'Clear'];
        const GLOSSARY_CONTROL_CELL_MARGIN = 0.0075;
        const GLOSSARY_CONTROL_CELL_WIDTH = (this.glossary.getMenuSize().width + GLOSSARY_CONTROL_CELL_MARGIN)/GLOSSARY_CONTROL_ITEMS.length - GLOSSARY_CONTROL_CELL_MARGIN;
        const GLOSSARY_CONTROL_CELL_HEIGHT = this.glossary.boxHeight;
        const GLOSSARY_CONTROL_CELL_DEPTH = 0.0005;
        const GLOSSARY_CONTROL_CELL_SCALE = 1;
        const GLOSSARY_CONTROL_CELL_TEXT_HEIGHT = 0.04;

        let glossaryControlMeshId = this.assets.createBoxMesh('glossary_control_btn_mesh', GLOSSARY_CONTROL_CELL_WIDTH, GLOSSARY_CONTROL_CELL_HEIGHT, GLOSSARY_CONTROL_CELL_DEPTH).id;
        let glossaryControlDefaultMaterialId = this.assets.createMaterial('glossary_control_default_btn_material', { color: MRE.Color3.DarkGray() }).id;

        let data = [ GLOSSARY_CONTROL_ITEMS.map(t => ({
            text: t
        })) ];

        this.glossaryControlStrip = new GridMenu(this.context, {
            // logic
            data,
            shape: {
                row: 1,
                col: GLOSSARY_CONTROL_ITEMS.length
            },
            // assets
            meshId: glossaryControlMeshId,
            defaultMaterialId: glossaryControlDefaultMaterialId,
            // control
            parentId: this.root.id,
            // transform
            offset: {
                x: 0,
                y: -(this.wordInfoPanel.getMenuSize().height + this.wordInfoPanel.margin + GLOSSARY_CONTROL_CELL_HEIGHT + GLOSSARY_CONTROL_CELL_MARGIN)
            },
            // dimensions
            margin: GLOSSARY_CONTROL_CELL_MARGIN,
            box: {
                width: GLOSSARY_CONTROL_CELL_WIDTH,
                height: GLOSSARY_CONTROL_CELL_HEIGHT,
                depth: GLOSSARY_CONTROL_CELL_DEPTH,
                scale: GLOSSARY_CONTROL_CELL_SCALE,
                textHeight: GLOSSARY_CONTROL_CELL_TEXT_HEIGHT,
                textColor: MRE.Color3.White()
            },
        });
        this.glossaryControlStrip.addBehavior((coord: Vector2, name: string, user: MRE.User) => {
            if (this.currentScene != 'glossary_menu') { return; }
            let col = coord.y;
            switch(col){
                case GLOSSARY_CONTROL_ITEMS.indexOf('Search'):
                    user.prompt("Search Item", true).then((dialog) => {
                        if (dialog.submitted) {
                            this.searchWord(dialog.text);
                            this.glossary.resetPageNum();
                            this.updateGlossary( this.getGlossaryPageData() );
                        }
                    });
                    break;
                case GLOSSARY_CONTROL_ITEMS.indexOf('Goto'):
                    user.prompt("Goto page", true).then((dialog) => {
                        if (dialog.submitted) {
                            let p = parseInt(dialog.text);
                            if (p!==NaN){
                                this.glossary.setPageNum(p, this.words.length);
                                this.updateGlossary( this.getGlossaryPageData() );
                            }
                        }
                    });
                    break;
                case GLOSSARY_CONTROL_ITEMS.indexOf('Prev'):
                    this.glossary.decrementPageNum();
                    this.updateGlossary( this.getGlossaryPageData() );
                    break
                case GLOSSARY_CONTROL_ITEMS.indexOf('Next'):
                    this.glossary.incrementPageNum(this.words.length);
                    this.updateGlossary( this.getGlossaryPageData() );
                    break
                case GLOSSARY_CONTROL_ITEMS.indexOf('Spawn'):
                    let index = this.glossary.getHighlightedIndex(this.glossary.coord);
                    let word = this.words[index];
                    this.spawnItem(word);
                    break;
                case GLOSSARY_CONTROL_ITEMS.indexOf('Delete'):
                    if (this.highlightedActor != null){
                        this.deleteItem(this.highlightedActor);
                    }
                    break;
            }
        });
    }

    private createNumberInput(){
        const NUMBER_INPUT_CELL_MARGIN = 0.005;
        const NUMBER_INPUT_CELL_WIDTH = (this.glossary.getMenuSize().width + NUMBER_INPUT_CELL_MARGIN)/3 - NUMBER_INPUT_CELL_MARGIN;
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

        const h1 = this.glossaryControlStrip.getMenuSize().height + this.glossaryControlStrip.margin;
        const h2 = this.wordInfoPanel.getMenuSize().height + this.wordInfoPanel.margin;
        const y = -(h1 + h2 + this.numberInput.margin + this.numberInput.boxHeight)
        this.numberInput.positionMenu({x: 0, y});

        this.numberInput.onIncrease(()=>{
            if (!['glossary_menu'].includes(this.currentScene)) { return; }
            if (this.highlightedActor != null){
                let box = this.highlightBoxes.get(this.highlightedActor);
                let scale = box.transform.local.scale;
                scale.x += SCALE_STEP;
                scale.y += SCALE_STEP;
                scale.z += SCALE_STEP;
                this.numberInput.updateText((scale.x/MODEL_SCALE).toString());
            }
        });

        this.numberInput.onDecrease(()=>{
            if (!['glossary_menu'].includes(this.currentScene)) { return; }
            if (this.highlightedActor != null){
                let box = this.highlightBoxes.get(this.highlightedActor);
                let scale = box.transform.local.scale;
                scale.x -= SCALE_STEP;
                scale.y -= SCALE_STEP;
                scale.z -= SCALE_STEP;
                this.numberInput.updateText((scale.x/MODEL_SCALE).toString());
            }
        });
        this.numberInput.onEdit((user)=>{
            if (!['glossary_menu'].includes(this.currentScene)) { return; }
            if (this.highlightedActor != null){
                user.prompt("Change scale to", true).then((dialog) => {
                    if (dialog.submitted) {
                        let int = parseInt(dialog.text)*MODEL_SCALE;
                        if(int !== NaN){
                            let box = this.highlightBoxes.get(this.highlightedActor);
                            let scale = box.transform.local.scale;
                            scale.x = int;
                            scale.y = int;
                            scale.z = int;
                            this.numberInput.updateText((scale.x/MODEL_SCALE).toString());
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

    private updateWordInfoPanel(word: WordData){
        if (word === undefined) return;
        // let url = new URL(word.thumbnail, THUMBNAILS_BASE_URL).toString();
        let url = word.thumbnail;
        let info = word.info;
        this.wordInfoPanel.updateCells([[{
            text: lineBreak(info, 40),
            material: this.loadMaterial(word.id, url)
        }]]);
    }

    private updateGlossary(pageData: WordData[]){
        let data = pageData.map(word => {
            // let url = new URL(word.thumbnail, THUMBNAILS_BASE_URL).toString();
            let url = word.thumbnail;
            return {
                text: lineBreak(word.info, 40),
                material: this.loadMaterial(word.id, url)
            }
        });
        this.glossary.updateCells(this.glossary.reshape(data));
    }

    ////////////////////
    //// material
    private loadMaterial(id: number, uri: string){
        let texture;
        if (!this.textures.has('texture_'+id)){
            texture = this.assets.createTexture('texture_'+id, {uri});
            this.textures.set('texture_'+id, texture);
        }else{
            texture = this.textures.get('texture_'+id);
        }

        let material;
        if(!this.materials.has('material_'+id)){
            material = this.assets.createMaterial('material_'+id, { color: MRE.Color3.White(), mainTextureId: texture.id });
            this.materials.set('material_'+id, material);
        }else{
            material = this.materials.get('material_'+id);
        }
        return material;
    }

    private async loadGltf(id: number, uri: string){
        let url = joinUrl(this.baseUrl +'/', uri);
        console.log(url);
        if (!this.prefabs.has(id)){
            let obj = await getGltf(url);
            let dim = gltfBoundingBox.computeBoundings(obj);
            
            await this.assets.loadGltf(url)
                .then(assets => {
                    this.prefabs.set(id, assets.find(a => a.prefab !== null) as MRE.Prefab);
                    this.dimensions.set(id, dim);
                })
                .catch(e => MRE.log.info("app", e));
        }
        return this.prefabs.get(id);
    }

    private equipBall(user: MRE.User){
        let tr = new MRE.ScaledTransform();
        this.ball.updateLocalTransform(tr);

        this.ball._button.attach(user, 'left-hand');
    }

    private unEquipBall(){
        if (this.ball._button.attachment !== undefined) {
            this.ball._button.detach();

            let tr = new MRE.ScaledTransform();
            tr.position = this.ball._button.transform.app.position;
            tr.rotation = this.ball._button.transform.app.rotation;
            tr.scale = this.ball._button.transform.local.scale;
            this.ball.updateLocalTransform(tr);
        }
    }

    private async spawnItem(word: WordData, _transform?: MRE.ActorTransformLike, editor: boolean = true){
        if (word === undefined) return;
        console.log('spawn', word);

        let size = this.glossary.getMenuSize();
        let url = word.model;

        let actor: MRE.Actor;
        let dim: BoundingBoxDimensions['dimensions'];
        let center: BoundingBoxDimensions['center']
        let prefab: MRE.Prefab;

        if (/^artifact:/.test(url)){
            dim = {width: 1, height: 1, depth: 1}
            center = {x: 0, y: 0, z: 0}
        }else{
            prefab = await this.loadGltf(word.id, url);
            dim = this.dimensions.get(word.id).dimensions;
            center = this.dimensions.get(word.id).center;
        }

        let pos = {x: size.width + 0.05 + dim.width*MODEL_SCALE/2, y: -dim.height*MODEL_SCALE/2, z: 0};
        let transform = (_transform !== undefined) ? _transform : {
            app: {
                position: {x: pos.x, y: pos.y, z: 0}
            },
            local: {
                position: {x: pos.x, y: pos.y, z: 0},
                scale: {x: MODEL_SCALE, y: MODEL_SCALE, z: MODEL_SCALE},
                rotation: MODEL_ROTATION
            }
        }; 

        let box = MRE.Actor.CreatePrimitive(this.assets, {
            definition: {
                shape: MRE.PrimitiveShape.Box,
                dimensions: {x: dim.width, y: dim.height, z: dim.depth}
            },
            addCollider: true,
            actor: {
                name: word.id.toString(),
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

        if (/^artifact:/.test(url)){
            actor = MRE.Actor.CreateFromLibrary(this.context, {
                resourceId: url,
                actor: {
                    parentId: box.id,
                    transform,
                    collider: {
                        geometry: { shape: MRE.ColliderType.Box },
                        layer: MRE.CollisionLayer.Hologram
                    }
                }
            });
        }else{
            actor = MRE.Actor.CreateFromPrefab(this.context, {
                prefabId: prefab.id,
                actor: {
                    parentId: box.id,
                    collider: { 
                        geometry: { shape: MRE.ColliderType.Box },
                        layer: MRE.CollisionLayer.Hologram
                    },
                    transform:{
                        local: {
                            position: {x: center.x, y: -center.z, z: -center.y},
                            scale: {x: 1, y: 1, z: 1}
                        }
                    },
                    grabbable: editor ? true : false
                }
            });
        }

        // remember box
        this.highlightBoxes.set(actor, box);
            
        // remember model character
        this.spawnedKanji.set(box, word);
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
                        let _id = this.spawnedKanji.get(box);
                        this.updateWordInfoPanel(_id);
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

    private searchWord(search: string = ''){
        if(!search.length){
            this.words = this.engDatabase.words;
        }else{
            this.words = this.engDatabase.words.filter((w: any) => {
                return w.info.toLowerCase().includes(search);
            });
        }
    }
}