import * as MRE from '@microsoft/mixed-reality-extension-sdk';
import { checkUserName } from '../utils';

const OWNER_NAME = process.env['OWNER_NAME'];

type ObjectDescriptor = {
    thumbnailUri: string;
    resourceId: string;
    attachPoint: string;
    scale?: {
        x: number;
        y: number;
        z: number;
    };
    rotation?: {
        x: number;
        y: number;
        z: number;
    };
    position?: {
        x: number;
        y: number;
        z: number;
    };
};

// game related data structures.
export interface ItemDescriptor {
    id: number,
    name: string,
    type: string,
    attack?: number,
    defense?: number,
    count?: number
    cost?: number,
    obj?: ObjectDescriptor
}

import { Vector2 } from '@microsoft/mixed-reality-extension-sdk';
import { Button } from './button';

export interface GridMenuOptions {
    // logic
    name?: string,
    title?: string,
    data?: CellData[][],
    shape?: {
        row: number,
        col: number
    },
    // assets
    meshId: MRE.Guid,
    defaultMaterialId: MRE.Guid,
    highlightMeshId?: MRE.Guid,
    highlightMaterialId?: MRE.Guid,
    planeMeshId?: MRE.Guid,
    defaultPlaneMaterial?: MRE.Material,
    // control
    parentId?: MRE.Guid,
    // transform
    offset?:{
        x: number,
        y: number
    }
    // dimensions
    margin?: number,
    titleTextHeight?: number,
    box?: {
        width: number,
        height: number,
        depth: number,
        scale?: number,
        textHeight?: number,
        textColor?: MRE.Color3,
        textAnchor?: MRE.TextAnchorLocation
    },
    highlight?:{
        depth: number
    }
    plane?:{
        width: number,
        height: number
    }
}

export interface CellData{
    text?: string,
    material?: MRE.Material
}

export class GridMenu {
    // unity
    protected context: MRE.Context;
    private _menu: MRE.Actor;
    private _label: MRE.Actor;

    private meshId: MRE.Guid;
    private defaultMaterialId: MRE.Guid;

    private highlightMeshId: MRE.Guid;
    private highlightMaterialId: MRE.Guid;
    private planeMeshId: MRE.Guid;

    private parentId: MRE.Guid;

    // debug
    private name: string;
    private defaultPlaneMaterial: MRE.Material;

    private _row: number;
    private _col: number;
    private box: GridMenuOptions['box'];
    private highlightDimensions: GridMenuOptions['highlight'];
    private plane: GridMenuOptions['plane'];
    private offset: GridMenuOptions['offset'];
    private data: CellData[][];
    private title: string;
    private titleTextHeight: number;
    private _margin: number;

    // logic
    protected buttons = new Map<string, Button>();
    private highlightButton: Button;
    private highlightedButtonCoord: Vector2;
    private isHighlighted: boolean = false;

    private _curPageNum: number = 1;

    // get 
    get root() {return this._menu};
    get highlighted() {return this.isHighlighted};
    get coord() {return this.highlightedButtonCoord};
    get curPageNum() {return this._curPageNum};
    get row() {return this._row};
    get col() {return this._col};
    get margin() {return this._margin};
    get boxHeight() {return this.box.height};
    get boxWidth() {return this.box.width};

    constructor(_context: MRE.Context, options?: GridMenuOptions){
        this.context = _context;

        this._row = (options.shape.row == undefined) ? 1 : options.shape.row;
        this._col = (options.shape.col == undefined) ? 1 : options.shape.col;
        this.offset = (options.offset == undefined) ? {x: 0, y: 0}: options.offset;
        this.box = (options.box == undefined) ? this.defaultBoxDimensions() : options.box;
        this.highlightDimensions = (options.highlight == undefined) ? this.defaultHightlightDimensions() : options.highlight;
        this.plane = (options.plane == undefined) ? {width: this.box.width, height: this.box.height}: options.plane;
        this._margin =(options.margin == undefined) ? 0.1 : options.margin;

        this.title = options.title;
        this.titleTextHeight = (options.titleTextHeight == undefined) ? 0.05 : options.titleTextHeight;

        this.meshId = options.meshId;
        this.defaultMaterialId = options.defaultMaterialId;

        this.highlightMeshId = options.highlightMeshId;
        this.highlightMaterialId = options.highlightMaterialId;
        this.planeMeshId = options.planeMeshId;
        this.defaultPlaneMaterial = options.defaultPlaneMaterial; // debug
        this.name = options.name;

        this.parentId = (options.parentId == undefined) ? null : options.parentId;

        // default data depends on defaultMaterialId
        this.data = (options.data == undefined) ? this.defaultGridLayoutData(this._row, this._col) : options.data;

        // parent
        this._menu = MRE.Actor.Create(this.context, {
            actor:{ 
                transform: { 
                    local: { position: { x: this.offset.x, y: this.offset.y } }
                },
                parentId: this.parentId
            }
        });

        // box
        this.createGrid(this._row, this._col);
        this.createHighlightButton();

        // title
        if (this.title != undefined){
            this.createTitle();
        }
    }

    private createGrid(row: number, col: number){
        for (let ri=0; ri<row; ri++){
            for (let ci=0; ci<col; ci++){
                let name = "btn_"+ri+"_"+ci;
                let d = this.data[ri][ci];
                let btn = new Button(this.context, 
                    {
                        name,
                        layer: MRE.CollisionLayer.Hologram,
                        position: { 
                            x: ci * (this.box.width + this._margin) + this.box.width/2,
                            y: (row - ri - 1) * (this.box.height + this._margin) + this.box.height/2,
                            z: 0
                        },
                        scale: { x: this.box.scale, y: this.box.scale, z: this.box.scale },
                        buttonDimensions: { width: this.box.width, height: this.box.height, depth: this.box.depth },
                        planeDimensions: this.plane,
                        parentId: this._menu.id,
                        meshId: this.meshId,
                        text: d.text,
                        textHeight: this.box.textHeight,
                        color: this.box.textColor,
                        anchor: this.box.textAnchor,
                        materialId: this.defaultMaterialId,
                        planeMeshId: this.planeMeshId,
                        planeMaterial: (d.material !== undefined) ? d.material: this.defaultPlaneMaterial
                    }
                );
                this.buttons.set(name, btn);
            }
        };
    }

    public addBehavior(onButtonClick: (coord: Vector2, name: string, user: MRE.User) => void){
        for (let ri=0; ri<this._row; ri++){
            for (let ci=0; ci<this._col; ci++){
                let n = "btn_"+ri+"_"+ci;
                let d = this.data[ri][ci];
                let btn = this.buttons.get(n);
                btn.addBehavior((user,_) => {
                    if (checkUserName(user, OWNER_NAME)){
                        onButtonClick(new Vector2(ri, ci), n, user);
                    }
                })
            }
        }
    }

    private createHighlightButton(){
        this.highlightedButtonCoord = new Vector2(0,0);
        this.highlightButton= new Button(this.context, 
            {
                name: 'highlight',
                layer: MRE.CollisionLayer.Hologram,
                position: { 
                    x: this.highlightedButtonCoord.y * (this.box.width + this._margin) + this.box.width/2,
                    y: (this._row - this.highlightedButtonCoord.x - 1) * (this.box.height + this._margin) + this.box.height/2,
                    z: 0
                },
                scale: { x: this.box.scale, y: this.box.scale, z: this.box.scale },
                enabled: false,
                buttonDimensions: { width: (this.box.width + this._margin), height: (this.box.height + this._margin), depth: this.highlightDimensions.depth },
                parentId: this._menu.id,
                meshId: this.highlightMeshId,
                text: '',
                materialId: this.highlightMaterialId
            }
        );
    }

    private createTitle(){
        let size = this.getMenuSize();
        this._label = MRE.Actor.Create(this.context, {
			actor: {
                name: 'title_text',
                parentId: this._menu.id,
				transform: {
					local: { 
                        position: {
                            x: size.width/2,
                            y: size.height + this.titleTextHeight/2 + this._margin,
                            z: 0
                        } 
                    }
				},
				text: {
					contents: this.title,
                    anchor: MRE.TextAnchorLocation.MiddleCenter,
                    color: MRE.Color3.White(),
					height: this.titleTextHeight
				}
			}
        });
    }

    public defaultCellData(): CellData{
        return {
            text: '',
            material: this.defaultPlaneMaterial
        }
    }

    private defaultGridLayoutData(row: number, col: number): CellData[][]{
        let material = this.defaultPlaneMaterial;
        return [...Array(row)].map((x,r) => [...Array(col)].map((y,c) => ({
            text: '',
            material
        })));
    }

    // convert 1d-array to 2d-array
    public reshape(arr: CellData[]){
        let fill = this._row * this._col - arr.length;
        for (let i=0; i<fill; i++){
            arr.push(this.defaultCellData());
        }

        let ret = [];
        while(arr.length) { ret.push(arr.splice(0,this._col)); }
        return ret;
    }

    private defaultBoxDimensions(){
        return {
            width: 1,
            height: 1,
            depth: 1,
            scale: 1
        }
    }

    private defaultHightlightDimensions(){
        return {
            depth: 1
        }
    }
    
    private defaultPlaneDimensions(){
        return {
            width: 1,
            height: 1
        }
    }

    public getMenuSize(){
        return {
            width: this._col * this.box.width + (this._col-1) * this._margin,
            height: this._row * this.box.height + (this._row-1) * this._margin
        }
    }

    public highlight(coord: Vector2, overwrite?: boolean){
        // click on highlight or not
        if (overwrite === undefined){
            if (this.isHighlighted && coord.equals(this.highlightedButtonCoord) || overwrite == true){
                this.highlightButton.disable();
                this.isHighlighted = false;
            }
            else{
                this.highlightButton.enable();
                this.isHighlighted = true;
            }
        } else {
            if (overwrite == false){
                this.highlightButton.disable();
                this.isHighlighted = false;
            }
            else{
                this.highlightButton.enable();
                this.isHighlighted = true;
            }
        }
        // update highlight
        this.highlightedButtonCoord = coord;
        this.moveHighlightTo(this.highlightedButtonCoord);
    }

    public getHighlightedIndex(coord: Vector2){
        let pageSize = this._row * this._col;
        return (this.curPageNum - 1) * pageSize + ( coord.x*this._col + coord.y );
    }
    
    private moveHighlightTo(coord: Vector2){
        this.highlightButton._button.transform.local.position.x = this.highlightedButtonCoord.y * (this.box.width + this._margin) + this.box.width/2;
        this.highlightButton._button.transform.local.position.y = (this._row - this.highlightedButtonCoord.x - 1) * (this.box.height + this._margin) + this.box.height/2;
    }

    public disable(){
        this._menu.appearance.enabled = false;
        this._menu.transform.local.position.z = this.box.depth*2;
    }

    public enable(){
        this._menu.appearance.enabled = true;
        this._menu.transform.local.position.z = 0;
    }

    public offsetMenu(offset: {x: number, y: number}){
        this._menu.transform.local.position.x += offset.x;
        this._menu.transform.local.position.y += offset.y;
    }

    public offsetLabels(offset: {x: number, y: number}){
        this.buttons.forEach(b=>{b.offsetLabel(offset)});
    }

    public planesAlignLeft(){
        this.buttons.forEach(b=>{b.planeAlignLeft()});
    }

    public labelsRightToPlane(){
        this.buttons.forEach(b=>{b.labelRightToPlane()});
    }

    public updateCells(data: CellData[][]){
        if (data.length < this._row) {return;}
        for (let i=0; i<data.length; i++){
            for (let j=0; j<data[i].length; j++){
                let d = data[i][j];
                let n = 'btn_'+i+'_'+j;
                let b = this.buttons.get(n);
                if (b !== undefined) { 
                    if (d.text !== undefined) { b.updateLabel(d.text); }
                    if (d.material !== undefined) { b.updateMaterial(b._plane, d.material); }
                }
            }
        }
    }

    private getPageNum(total: number){
        let pageSize = this._row * this._col;
        return total/pageSize + ((total%pageSize == 0) ? 0 : 1);
    }

    public incrementPageNum(total: number){
        if (this._curPageNum < this.getPageNum(total)-1){
            this._curPageNum += 1;
        }
    }

    public decrementPageNum(){
        if (this._curPageNum > 1){
            this._curPageNum -= 1;
        }
    }

    public resetPageNum(){
        this._curPageNum = 1;
    }

    public setPageNum(page: number, total: number){
        this._curPageNum = (page <= this.getPageNum(total) && page > 0) ? page : ((page <=0) ? 1 :this.getPageNum(total));
    }
}