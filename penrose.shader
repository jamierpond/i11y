// "Aperiodic Penrose Tiling" by dr2 - 2020
// License: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License

/*
 Based on an old program that used OpenGL to draw quads; that was much more
 efficient than the present pixel-based version and allowed much larger grids.
 Using de Bruijn's projection method [Math. Proc. A 84 (1981) 39,53]

 Projection method also used by knighty (https://www.shadertoy.com/view/XdtBzH) to
 produce a symmetric pattern, but not a full aperiodic tiling.
 An alternative (and faster) substitution method was used by tomkh
 (https://www.shadertoy.com/view/4t2XWG).
 There are other examples (search: penrose) that consider the related kite-and-dart tiles.
*/

#define BIG  0  // set =1 for larger grid - more work!!!

#define VAR_ZERO min (nFrame, 0)

mat3 VToRMat (vec3 v, float a);
float Maxv3 (vec3 p);
vec2 Rot2D (vec2 q, float a);
vec3 HsvToRgb (vec3 c);

float tCur;
int nFrame;
bool showPoly, rhomCol;
const float pi = 3.1415927;

bool InTri (vec2 p, vec2 v0, vec2 v1, vec2 v2)
{
  vec3 s;
  vec2 v10, v20, p0;
  float d;
  v10 = v1 - v0;
  v20 = v2 - v0;
  d = v20.y * v10.x - v20.x * v10.y;
  p0 = p - v0;
  s.xy = vec2 (v20.y * p0.x - v20.x * p0.y, - v10.y * p0.x + v10.x * p0.y);
  s = abs (vec3 (s.xy, d - s.x - s.y) - 0.5 * d);
  return (Maxv3 (s) < 0.5 * abs (d));
}

vec3 ShowScene (vec2 uv)
{
  vec3 col, vn, ltDir;
  vec2 vp[5], csn[5], g, gg, mp, offset, up, vm, v[3];
  float gam[5], gamSum, kCur[5], d, dm, di, rr, pScale, r1, r2, ic, f;
  bool fatRom, done;
#if BIG
  const float kLimit = 7.;
  pScale = 0.09;
#else
  const float kLimit = 4.;
  pScale = 0.15;
#endif
  offset = Rot2D (vec2 (1.7, 0.), 0.05 * pi * tCur);
  uv /= pScale;
  uv -= offset;
  r1 = 0.5 * sin (pi / 5.);
  r2 = 0.5 * sin (2. * pi / 5.);
  for (int k = 0; k < 5; k ++) csn[k] = sin (2. * pi * float (k) / 5. + vec2 (0.5 * pi, 0.));
  gamSum = 0.;
  for (int k = 0; k < 4; k ++) {
    gam[k] = 0.1 * float (k + 1);
    gamSum += gam[k];
  }
  gam[4] = - gamSum;
  done = false;
  ic = -1.;
  for (int k1 = VAR_ZERO; k1 <= 3; k1 ++) {
    for (int k2 = VAR_ZERO + 1; k2 <= 4; k2 ++) {
      if (k2 >= k1 + 1) {
        fatRom = (k2 - k1 == 1 || k2 - k1 == 4);
        rr = fatRom ? r2 * r2 : r1 * r1;
        ++ ic;
        gg = - gam[k1] * csn[k2] + gam[k2] * csn[k1];
        di = 1. / (csn[k1].x * csn[k2].y - csn[k2].x * csn[k1].y);
        for (float kV1 = - kLimit + float (VAR_ZERO); kV1 <= kLimit; kV1 ++) {
          kCur[k1] = kV1;
          for (float kV2 = - kLimit + float (VAR_ZERO); kV2 <= kLimit; kV2 ++) {
            kCur[k2] = kV2;
            g = (gg + kV1 * csn[k2] - kV2 * csn[k1]).yx * vec2 (1., -1.);
            for (int k = 0; k < 5; k ++) {
              if (k != k1 && k != k2) {
                d = dot (csn[k], g) * di + gam[k];
                d += step (0., d);
                kCur[k] = floor (abs (d)) * sign (d);
              }
            }
            vp[0] = vec2 (0.);
            for (int k = 0; k < 5; k ++) vp[0] += kCur[k] * csn[k];
            vp[1] = vp[0] + csn[k1];
            vp[2] = vp[0] + csn[k1] + csn[k2];
            vp[3] = vp[0] + csn[k2];
            mp = 0.25 * (vp[0] + vp[1] + vp[2] + vp[3]) - uv;
            if (showPoly) done = (InTri (uv, vp[0], vp[1], vp[2]) ||
               InTri (uv, vp[0], vp[3], vp[2]));
            else done = (dot (mp, mp) < rr);
            if (done) break;
          }
          if (done) break;
        }
      }
      if (done) break;
    }
    if (done) break;
  }
  if (done) {
    if (showPoly) {
      dm = 99.;
      vp[4] = vp[0];
      for (int k = 0; k < 4; k ++) {
        up = uv - vp[k];
        v[0] = normalize (vp[k + 1] - vp[k]);
        if (k == 0) v[1] = v[0];
        else if (k == 1) v[2] = v[0];
        f = dot (v[0], up);
        d = dot (up, up) - f * f;
        if (d < dm) {
          dm = d;
          vm = v[0];
        }
      }
      dm = sqrt (dm);
      if (rhomCol) col = HsvToRgb (vec3 (0.1 * ic, (fatRom ? 1. : 0.5), 1.));
      else col = fatRom ? vec3 (0., 1., 0.) : vec3 (1., 0., 0.);
      col *= 0.4 + 0.6 * smoothstep (0.01, 0.03, dm);
      vn = VToRMat (vec3 (vm, 0.), 0.12 * pi * sign (v[1].x * v[2].y - v[2].x * v[1].y) *
         (1. - smoothstep (0., 0.15, dm))) * vec3 (0., 0., -1.);
    } else {
      col = vec3 (1., 1., (fatRom ? 0. : 0.5)) * (1. - smoothstep (0.9, 0.99, dot (mp, mp) / rr));
      vn = - normalize (vec3 (mp, 0.7));
    }
    ltDir = normalize (vec3 (0.4, 0.6, -1.));
    f = max (dot (vn, ltDir), 0.);
    col = col * (0.2 + 0.8 * f * f + 0.5 * pow (max (0., dot (ltDir,
       reflect (vec3 (0., 0., 1.), vn))), 32.));
    col *= 0.1 + 0.9 * smoothstep (0.1, 0.9, Maxv3 (col));
  } else col = vec3 (0.1, 0.1, 0.1);
  return col;
}

#define AA   0

void mainImage (out vec4 fragColor, in vec2 fragCoord)
{
  vec4 mPtr;
  vec3 col;
  vec2 canvas, uv, uvv;
  float asp, sr;
  canvas = iResolution.xy;
  uv = 2. * fragCoord.xy / canvas - 1.;
  uv.x *= canvas.x / canvas.y;
  tCur = iTime;
  nFrame = iFrame;
  mPtr = iMouse;
  mPtr.xy = mPtr.xy / canvas - 0.5;
  asp = canvas.x / canvas.y;
  rhomCol = true;
  showPoly = true;
  if (mPtr.z > 0.) {
    if (mPtr.y > 0.) showPoly = false;
    else rhomCol = false;
  }
  if (abs (uv.x) < 1.) {
#if ! AA
    const float naa = 1.;
#else
    const float naa = 3.;
#endif
    col = vec3 (0.);
    sr = 2. * mod (dot (mod (floor (0.5 * (uv + 1.) * canvas), 2.), vec2 (1.)), 2.) - 1.;
    for (float a = float (VAR_ZERO); a < naa; a ++) {
      uvv = uv + step (1.5, naa) * Rot2D (vec2 (0.5 / canvas.y, 0.), sr * (0.667 * a + 0.5) * pi);
      col += (1. / naa) * ShowScene (uvv);
    }
  } else col = vec3 (0.82);
  fragColor = vec4 (col, 1.);
}

mat3 VToRMat (vec3 v, float a)
{
  mat3 m;
  vec3 w, b1, b2;
  vec2 cs;
  cs = sin (a + vec2 (0.5 * pi, 0.));
  w = (1. - cs.x) * v * v + cs.x;
  b1 = (1. - cs.x) * v.zyx * v.xzy;
  b2 = - cs.y * v;
  m[0][0] = w.x;  m[1][1] = w.y;  m[2][2] = w.z;
  m[1][2] = b1.x + b2.x;  m[2][1] = b1.x - b2.x;
  m[2][0] = b1.y + b2.y;  m[0][2] = b1.y - b2.y;
  m[0][1] = b1.z + b2.z;  m[1][0] = b1.z - b2.z;
  return m;
}

float Maxv3 (vec3 p)
{
  return max (p.x, max (p.y, p.z));
}

vec2 Rot2D (vec2 q, float a)
{
  vec2 cs;
  cs = sin (a + vec2 (0.5 * pi, 0.));
  return vec2 (dot (q, vec2 (cs.x, - cs.y)), dot (q.yx, cs));
}

vec3 HsvToRgb (vec3 c)
{
  return c.z * mix (vec3 (1.), clamp (abs (fract (c.xxx + vec3 (1., 2./3., 1./3.)) * 6. - 3.) - 1., 0., 1.), c.y);
}

