class BloodSplatter {
  constructor() {
    this.blood = new PIXI.Container();
    this.Update();
    canvas.background.addChild(this.blood);
    canvas.background.BloodSplatter = this;
  }

  Splat(scale, color, alpha) {
    let scaleRandom = 0.8 + Math.random() * 0.4;
    let cachedTex =
      PIXI.utils.TextureCache[
        `modules/splatter/bloodsplats/blood${Math.floor(
          Math.random() * 26
        )}.svg`
      ];
    let sprite = cachedTex
      ? new PIXI.Sprite.from(cachedTex)
      : new PIXI.Sprite.from(
          `modules/splatter/bloodsplats/blood${Math.floor(
            Math.random() * 26
          )}.svg`
        );
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(
      scale * this.scaleMulti * scaleRandom,
      scale * this.scaleMulti * scaleRandom
    );
    sprite.alpha = alpha ?? this.alpha;
    sprite.tint = color || this.color;
    sprite.rotation = Math.random() * Math.PI * 2;
    return sprite;
  }

  SplatFromToken(token, { extraScale = 1, isTrail = false } = {}) {
    const colorFlag = token.data.flags.splatter?.bloodColor;
    let colorData = {};
    if (!colorFlag && this.bloodSheet) {
      const creatureType = this.creatureType(token);
      colorData = this.ColorStringToHexAlpha(this.bloodSheetData[creatureType]);
    }
    if (colorFlag) {
      colorData = this.ColorStringToHexAlpha(colorFlag);
    }
    const splatScale =
      token.data.scale *
      Math.max(token.data.width, token.data.height) *
      extraScale;
    const violence = isTrail ? 1 : this.violence;
    let splatContainer = new PIXI.Container();
    splatContainer.x = token.center.x;
    splatContainer.y = token.center.y;
    for (let i = 0; i < violence; i++) {
      splatContainer.addChild(
        this.Splat(splatScale, colorData?.color, colorData?.alpha)
      );
    }
    if (this.wallsBlock) {
      const maxDimension = Math.max(
        splatContainer.width,
        splatContainer.height
      );
      const radius = maxDimension > 10 ? maxDimension : 1000;
      const tokenMaxDim = Math.max(token.data.width, token.data.height);
      if (radius >= tokenMaxDim) {
        let mask = BloodSplatter.getMask(token.center, radius);
        splatContainer.addChild(mask);
        splatContainer.mask = mask;
      }
    }
    this.blood.addChild(splatContainer);
  }

  Destroy() {
    this.blood.destroy({ children: true, texture: true });
    canvas.background.BloodSplatter = null;
  }

  Update() {
    const colorData = this.ColorStringToHexAlpha(
      game.settings.get("splatter", "bloodColor")
    );
    this.color = colorData?.color;
    this.alpha = colorData?.alpha;
    this.bloodSheet = game.settings.get("splatter", "useBloodsheet");
    this.bloodSheetData = game.settings.get("splatter", "BloodSheetData");
    this.violence = game.settings.get("splatter", "violence");
    this.scaleMulti = game.settings.get("splatter", "bloodsplatterScale");
    this.wallsBlock = game.settings.get("splatter", "wallsBlockBlood");
    this.inCombat = game.settings.get("splatter", "onlyInCombat");
    this.scaleMulti =
      (canvas.dimensions.size / 100) *
      game.settings.get("splatter", "bloodsplatterScale");
  }

  ColorStringToHexAlpha(colorString) {
    if (!colorString) return undefined;
    const color = "0x" + colorString.slice(1, 7);
    const alpha = parseInt(colorString.slice(7), 16) / 255;
    return { color: color, alpha: alpha };
  }

  creatureType(token) {
    return (
      BloodSplatter.getCreatureTypeCustom(token.actor.data) ||
      BloodSplatter.getCreatureType(token.actor.data)
    );
  }

  static getMask(origin, radius) {
    const { rays, los, fov } = canvas.walls.computePolygon(origin, radius, {
      type: "movement",
      density: "12",
    });
    let g = new PIXI.Graphics();
    g.beginFill(0xffffff);
    g.drawPolygon(fov);
    g.endFill();
    g.x -= origin.x;
    g.y -= origin.y;
    g.isMask = true;
    return g;
  }

  static bloodTrail(wrapped, ...args) {
    if (
      this.actor &&
      !this.bleeding &&
      (!canvas.background.BloodSplatter?.inCombat ||
        (canvas.background.BloodSplatter?.inCombat && game.combat?.started))
    ) {
      this.bleeding = true;
      const timeout = canvas.background.BloodSplatter?.violence
        ? 300 - canvas.background.BloodSplatter?.violence * 20
        : 100;
      setTimeout(() => {
        if (BloodSplatter.belowTreshold(this.actor)) {
          if (canvas.background.BloodSplatter) {
            canvas.background.BloodSplatter.SplatFromToken(this, {
              extraScale: Math.random() * 0.5,
              isTrail: true,
            });
          } else {
            new BloodSplatter();
            canvas.background.BloodSplatter.SplatFromToken(this, {
              extraScale: Math.random() * 0.5,
              isTrail: true,
            });
          }
        }
        this.bleeding = false;
      }, timeout);
    }
    return wrapped(...args);
  }

  static socketSplatFn(tokenIds) {
    if(!game.settings.get("splatter", "enableBloodsplatter")) return
    for (let tokenId of tokenIds) {
      let token = canvas.tokens.get(tokenId);
      if (!token) return;
      if (canvas.background.BloodSplatter) {
        canvas.background.BloodSplatter.SplatFromToken(token);
      } else {
        new BloodSplatter();
        canvas.background.BloodSplatter.SplatFromToken(token);
      }
    }
  }

  static socketSplat(tokens) {
    let tokenIds = tokens.map((token) => token.id);
    BloodSplatterSocket.executeForEveryone("Splat", tokenIds);
  }

  static belowTreshold(actor) {
    const hpMax = BloodSplatter.getHpMax(actor.data);
    const hpVal = BloodSplatter.getHpVal(actor.data);
    if (
      (100 * hpVal) / hpMax <=
      game.settings.get("splatter", "bloodsplatterThreshold")
    )
      return true;
    return false;
  }
  static getHpVal(actorData) {
    return Object.byString(
      actorData,
      game.settings.get("splatter", "currentHp")
    );
  }
  static getHpMax(actorData) {
    return Object.byString(actorData, game.settings.get("splatter", "maxHp"));
  }
  static getCreatureType(actorData) {
    return Object.byString(
      actorData,
      game.settings.get("splatter", "creatureType")
    );
  }
  static getCreatureTypeCustom(actorData) {
    return Object.byString(
      actorData,
      game.settings.get("splatter", "creatureTypeCustom")
    );
  }
}

let BloodSplatterSocket;

Hooks.once("socketlib.ready", () => {
  BloodSplatterSocket = socketlib.registerModule("splatter");
  BloodSplatterSocket.register("Splat", BloodSplatter.socketSplatFn);
});

Hooks.on("preUpdateActor", function (actor, updates) {
  if (
    !game.settings.get("splatter", "enableBloodsplatter") ||
    (game.settings.get("splatter", "onlyInCombat") && !game.combat?.started)
  )
    return;
  let token = actor.parent
    ? canvas.tokens.get(actor.parent.id)
    : canvas.tokens.placeables.find((t) => t.actor.id == actor.id);
  const hpMax = BloodSplatter.getHpMax(actor.data);
  const oldHpVal = BloodSplatter.getHpVal(actor.data);
  const hpVal = BloodSplatter.getHpVal(updates);
  const impactScale = (oldHpVal - hpVal) / hpMax + 0.7;
  if (
    hpVal != undefined &&
    hpVal <= oldHpVal &&
    (100 * hpVal) / hpMax <=
      game.settings.get("splatter", "bloodsplatterThreshold")
  ) {
    if (!canvas.background.BloodSplatter) {
      new BloodSplatter();
      canvas.background.BloodSplatter.SplatFromToken(token, {
        extraScale: impactScale,
      });
    } else {
      canvas.background.BloodSplatter.SplatFromToken(token, {
        extraScale: impactScale,
      });
    }
  }
});

Hooks.on("canvasReady", function () {
  if (canvas.background.BloodSplatter)
    canvas.background.BloodSplatter.Destroy();
});
