struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) color: vec4<f32>,
};
struct VertexOutput {
    @location(0) color: vec4<f32>,
    @location(1) world_position: vec4<f32>,
    @builtin(position) position: vec4<f32>,
};
struct FireParticle {
    origin: vec4f,
    direction: vec4f,
    birth_time: f32,
    lifetime: f32,
    size: f32,
    _pad: f32,
};

@group(0) @binding(0)
var<uniform> view_proj: mat4x4<f32>;
@group(0) @binding(1)
var<uniform> time: f32;
@group(0) @binding(2)
var<storage> particles: array<FireParticle>;
@group(0) @binding(3)
var<uniform> particle_count: u32;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var result: VertexOutput;
    let idx = u32(input.color.r * 255.0 + 0.5);
    if (idx >= particle_count) {
        result.position = vec4f(0.0, 0.0, 0.0, 1.0);
        result.color = vec4f(0.0);
        result.world_position = vec4f(0.0);
        return result;
    }
    let p = particles[idx];
    let age = time - p.birth_time;
    let progress = clamp(age / p.lifetime, 0.0, 1.0);
    let eased = 1.0 - (1.0 - progress) * (1.0 - progress);
    let world_pos = p.origin.xyz + p.direction.xyz * eased * p.size;
    let scale = 1.0 - progress * 0.6;
    let final_pos = vec4f(world_pos + input.position.xyz * scale, 1.0);
    result.world_position = final_pos;
    result.position = view_proj * final_pos;
    let heat = 1.0 - progress;
    result.color = vec4f(1.0, heat * 0.6, heat * heat * 0.1, 1.0 - progress * 0.7);
    return result;
}

@fragment
fn fs_main(vertex: VertexOutput) -> @location(0) vec4<f32> {
    if (vertex.color.a <= 0.0) {
        discard;
    }
    let glow = vertex.color.rgb * 2.0;
    return vec4(glow, vertex.color.a);
}
