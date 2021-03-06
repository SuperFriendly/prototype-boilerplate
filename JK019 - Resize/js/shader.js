// shaders
PIXI.utils.skipHello()

var rippleShader = `
precision mediump float;

varying vec2 vTextureCoord;
varying vec4 vColor;

uniform sampler2D uSampler;
uniform float iTime;
uniform vec2 iResolution;

void main(void)
{
    vec2 uv = vTextureCoord.xy;
    float adjustedTime = iTime * 0.005;
    
    uv.x += (sin((uv.y + (adjustedTime * 0.02)) * 25.0) * 0.0019) + (sin((uv.y + (adjustedTime * 0.1)) * 15.0) * 0.002);
    uv.y += (cos((uv.y + (adjustedTime * 0.04)) * 15.0) * 0.0069) + (cos((uv.y + (adjustedTime * 0.1)) * 10.0) * 0.002);
    
    vec4 fg = texture2D(uSampler, uv);
    gl_FragColor = fg;
}
`;

var zoomBlurShader = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 filterArea;

uniform vec2 uCenter;
uniform float uStrength;
uniform float uInnerRadius;
uniform float uRadius;

const float MAX_KERNEL_SIZE = 32.0;

float random(vec3 scale, float seed) {
    // use the fragment position for a different seed per-pixel
    return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);
}

void main() {
    
    float minGradient = uInnerRadius * 0.3;
    float innerRadius = (uInnerRadius + minGradient * 0.5) / filterArea.x;
    
    float gradient = uRadius * 0.3;
    float radius = (uRadius - gradient * 0.5) / filterArea.x;
    
    float countLimit = MAX_KERNEL_SIZE;
    
    vec2 dir = vec2(uCenter.xy / filterArea.xy - vTextureCoord);
    float dist = length(vec2(dir.x, dir.y * filterArea.y / filterArea.x));
    
    float strength = uStrength;
    
    float delta = 0.0;
    float gap;
    if (dist < innerRadius) {
        delta = innerRadius - dist;
        gap = minGradient;
    } else if (radius >= 0.0 && dist > radius) { // radius < 0 means it's infinity
    delta = dist - radius;
    gap = gradient;
}

if (delta > 0.0) {
    float normalCount = gap / filterArea.x;
    delta = (normalCount - delta) / normalCount;
    countLimit *= delta;
    strength *= delta;
    if (countLimit < 1.0)
    {
        gl_FragColor = texture2D(uSampler, vTextureCoord);
        return;
    }
}

// randomize the lookup values to hide the fixed number of samples
float offset = random(vec3(12.9898, 78.233, 151.7182), 0.0);

float total = 0.0;
vec4 color = vec4(0.0);

dir *= strength;

for (float t = 0.0; t < MAX_KERNEL_SIZE; t++) {
    float percent = (t + offset) / MAX_KERNEL_SIZE;
    float weight = 4.0 * (percent - percent * percent);
    vec2 p = vTextureCoord + dir * percent;
    vec4 sample = texture2D(uSampler, p);
    
    // switch to pre-multiplied alpha to correctly blur transparent images
    // sample.rgb *= sample.a;
    
    color += sample * weight;
    total += weight;
    
    if (t > countLimit){
        break;
    }
}

color /= total;
// switch back from pre-multiplied alpha
color.rgb /= color.a + 0.00001;

gl_FragColor = color;
}
`;
//

var element = document.querySelector("[data-canvas]")
var width
var height
var isIn = true
var image
var bgImage
var container
var rippleFilter
var zoomBlurFilter
var alphaFilter
var radius
var app = new PIXI.Application({ width: 1, height: 1 });
var isWebGL = (app.renderer instanceof PIXI.WebGLRenderer)
var tweens = {}
var time = 0
var isReady = false


function ready() {
    isReady = true
    container = new PIXI.Container();

    container.addChild(bgImage)
    container.addChild(image)
    app.stage.addChild(container)
    element.appendChild(app.view)

    if (isWebGL) {
        rippleFilter = new PIXI.Filter(null, rippleShader)

        alphaFilter = new PIXI.filters.AlphaFilter(1)

        zoomBlurFilter = new PIXI.Filter(null, zoomBlurShader)
        zoomBlurFilter.uniforms.uStrength = 0.5;
        zoomBlurFilter.uniforms.uRadius = -1;

        image.filters = [rippleFilter]
        container.filters = [zoomBlurFilter, alphaFilter]
    }

    if (isWebGL) {
        app.ticker.add(function (delta) {
            rippleFilter.uniforms.iTime = time;

            zoomBlurFilter.uniforms.uInnerRadius = radius - (Math.sin(time * 0.02) * 25)
            time += delta
        })
    }

    window.addEventListener("keydown", function () {
        isIn = !isIn;

        for (var key in tweens) {
            tweens[key].kill()
        }

        if (isWebGL) {
            tweens["alpha"] = new TweenLite(alphaFilter, 1, { alpha: isIn ? 1 : 0, delay: 0.125 })
            tweens["zoomBlur"] = new TweenLite(zoomBlurFilter.uniforms, 1, {
                uStrength: isIn ? 0.5 : 1
            })
        }
        else {
            tweens["alpha"] = new TweenLite(container, 1, { alpha: isIn ? 1 : 0 })
        }

    })    

    windowResized()
}

function onAssetLoaded(loader, resources) {
    image = new PIXI.Sprite(resources.image.texture)
    bgImage = new PIXI.Sprite(resources.image.texture)
}

function init() {
    var loader = new PIXI.loaders.Loader();

    loader.add('image', document.querySelector("img").src)
    loader.load(onAssetLoaded)
    loader.onComplete.add(function() {
        ready()
    })
}

function windowResized() {
    var elementWidth = element.offsetWidth
    var elementHeight = element.offsetHeight
    app.renderer.resize(elementWidth, elementHeight)

    if(!isReady) {
        return
    }
    
    var imageWidth = image.texture.orig.width
    var imageHeight = image.texture.orig.height

    var aspectRatio = imageWidth / imageHeight
    
    var scaleX = elementWidth / imageWidth
    var scaleY = elementHeight / imageHeight
    
    var scale = Math.max(scaleX, scaleY)    
    
    width = imageWidth * scale
    height = imageHeight * scale
    
    image.width = width
    image.height = height
    bgImage.width = width
    bgImage.height = height
    
    var x = -(width - elementWidth) / 2
    var y = -(height - elementHeight) / 2
    
    image.position.x = x
    image.position.y = y
    bgImage.position.x = x
    bgImage.position.y = y
    
    radius = Math.max(elementWidth, elementHeight) / 2
    if(isWebGL) {
        rippleFilter.uniforms.iResolution = [width, height]
        zoomBlurFilter.uniforms.uCenter = [(width  / 2 ) + x, (height / 2) + y];
        zoomBlurFilter.uniforms.uInnerRadius = radius;        
    }
}

window.addEventListener("resize", () => { windowResized() })
windowResized()
init()