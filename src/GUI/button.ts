import * as MRE from '@microsoft/mixed-reality-extension-sdk';

export interface ButtonOptions {
    // controls
    name?: string,
    parentId?: MRE.Guid,
    enabled?: boolean,
    // transform
    position?: Partial<MRE.Vector3Like>,
    rotation?: MRE.Vector3Like,
    scale?: MRE.Vector3Like,
    // box
    meshId: MRE.Guid,
    materialId: MRE.Guid,
    buttonDimensions?: {
        width: number,
        height: number,
        depth: number
    },
    // text
    text?: string,
    textHeight?: number,
    color?: MRE.Color3,
    anchor?: MRE.TextAnchorLocation,
    // plane
    planeMeshId?: MRE.Guid,
    planeMaterial?: MRE.Material,
    layer?: MRE.CollisionLayer,
    planeDimensions?: {
        width?: number,
        height?: number
    }
}

export class Button {
    // text
    private _text: string;
    private _textColor: MRE.Color3;
    private anchor: MRE.TextAnchorLocation;
    private textHeight: number;

    private _box: MRE.Actor;
    private _label: MRE.Actor;
    private _picture: MRE.Actor;

    private buttonDimensions: ButtonOptions['buttonDimensions'];
    private planeDimensions: ButtonOptions['planeDimensions'];
    private planeMeshId: MRE.Guid;
    private planeMaterial: MRE.Material;

    private buttonBehavior: MRE.ButtonBehavior;

    private isHolding: boolean = false;
    private isExit: boolean = false;

    get _button(){
        return this._box;
    }

    get _plane(){
        return this._picture;
    }

    get text(){
        return this._text;
    }

    constructor(context: MRE.Context, options?: ButtonOptions){
        let position = (options.position !== undefined) ? options.position : { x: 0, y: 0, z: 0 };
        let scale = (options.scale !== undefined) ? options.scale : { x: 1, y: 1, z: 1 };
        let enabled = (options.enabled !== undefined) ? options.enabled : true;
        let layer = (options.layer !== undefined) ? options.layer : MRE.CollisionLayer.Default;
        let parentId = (options.parentId !== undefined) ? options.parentId : null;

        this._text = (options.text !== undefined) ? options.text : '?';
        this._textColor = (options.color !== undefined) ? options.color : MRE.Color3.Black();
        this.textHeight = (options.textHeight !== undefined) ? options.textHeight : 0.05;
        this.anchor = (options.anchor !== undefined) ? options.anchor : MRE.TextAnchorLocation.MiddleCenter;

        let meshId = options.meshId;
        let materialId = options.materialId;
        this.buttonDimensions = (options.buttonDimensions !== undefined) ? options.buttonDimensions : {width: 0, height: 0, depth: 0};
        this.planeDimensions = (options.planeDimensions !== undefined) ? options.planeDimensions : {width: this.buttonDimensions.width, height: this.buttonDimensions.height};
        this.planeMeshId = options.planeMeshId;

        // debug
        this.planeMaterial = options.planeMaterial;

        this._box = MRE.Actor.Create(context, {
            actor: {
                parentId,
                appearance: {
                    meshId,
                    materialId,
                    enabled
                },
                transform: {
                    local: {
                        position,
                        scale
                    }
                },
                collider: { 
                    geometry: { shape: MRE.ColliderType.Auto },
                    layer
                }
            }
        });

        this._label = MRE.Actor.Create(context, {
			actor: {
                name: 'Text',
                parentId,
				transform: {
					local: { position: {x: position.x, y: position.y, z: position.z - this.buttonDimensions.depth - 0.0001} }
				},
				text: {
					contents: this._text,
					anchor: this.anchor,
                    color: this._textColor,
					height: this.textHeight
				}
			}
        });

        if (this.planeMeshId != undefined){
            this._picture = MRE.Actor.Create(context, {
                actor: {
                    parentId,
                    appearance: {
                        meshId: this.planeMeshId,
                        materialId: this.planeMaterial.id,
                        enabled
                    },
                    transform: {
                        local: {
                            scale,
                            position: {
                                x: position.x,
                                y: position.y,
                                z: position.z - this.buttonDimensions.depth/2 - 0.0001
                            },
                            rotation: MRE.Quaternion.FromEulerAngles(-90 * MRE.DegreesToRadians, 0 * MRE.DegreesToRadians, 0 * MRE.DegreesToRadians),
                        }
                    }
                }
            });
        }
        
        this.buttonBehavior = this._button.setBehavior(MRE.ButtonBehavior);
    }

    public planeAlignLeft(){
        this._picture.transform.local.position.x += (this.planeDimensions.width - this.buttonDimensions.width)/2;
    }

    public labelRightToPlane(){
        this._label.transform.local.position.x += (this.planeDimensions.width - this.buttonDimensions.width/2) + 0.01;
        this._label.text.anchor = MRE.TextAnchorLocation.MiddleLeft;
    }

    public addBehavior(handler: MRE.ActionHandler<MRE.ButtonEventData>){
        this.buttonBehavior.onClick(handler);
    }

    public addHoldingBehavior(handler: MRE.ActionHandler<MRE.ButtonEventData>){
        this.buttonBehavior.onButton('holding', (user, actionData) => {
            if (!this.isHolding){
                this.isHolding = true;
                handler(user, actionData);
            }
        });
    }

    public addReleaseBehavior(handler: MRE.ActionHandler<MRE.ButtonEventData>){
        this.buttonBehavior.onButton('released', (user, actionData) => {
            this.isHolding = false;
            handler(user, actionData);
        });
    }

    public addHoverExitBehavior(handler: MRE.ActionHandler<MRE.ButtonEventData>){
        this.buttonBehavior.onHover('exit', (user, actionData) => {
            this.isExit = true;
            handler(user, actionData);
        });
    }

    public addHoverEnterBehavior(handler: MRE.ActionHandler<MRE.ButtonEventData>){
        this.buttonBehavior.onHover('enter', (user, actionData) => {
            this.isExit = false;
            handler(user, actionData);
        });
    }

    public updateLabel(text: string, color?: MRE.Color3){
        this._label.text.contents = text;
        this._label.text.color = color;
    }

    public updateLocalTransform(transform: MRE.ScaledTransform){
        this._label.transform.local = transform;
        this._button.transform.local = transform;
    }

    public offsetLabel(offset: {x: number, y: number}){
        this._label.transform.local.position.x += offset.x;
        this._label.transform.local.position.y += offset.y;
    }

    public updateColor(_color: MRE.Color3){
        this._button.appearance.material.color = new MRE.Color4(_color.r, _color.g, _color.b, 1);
    }

    public updateMaterial(actor: MRE.Actor, material: MRE.Material){
        actor.appearance.material = material;
    }

    public enable(){
        this._button.appearance.enabled = true;
    }

    public disable(){
        this._button.appearance.enabled = false;
    }
}