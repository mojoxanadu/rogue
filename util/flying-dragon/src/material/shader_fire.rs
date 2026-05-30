use crate::geometry::Vertex;
use crate::material::Shader;
use crate::world::Renderer;
use glam::Mat4;
use std::borrow::Cow;
use std::mem::size_of;
use wgpu::{
    BindGroup, BindGroupDescriptor, BindGroupEntry, BindGroupLayoutDescriptor,
    Buffer, BufferAddress, BufferBindingType, BufferUsages, CompareFunction,
    DepthBiasState, DepthStencilState, Face, FragmentState, FrontFace, MultisampleState, PipelineCompilationOptions,
    PipelineLayoutDescriptor, PrimitiveState, Queue, RenderPass, RenderPipeline, RenderPipelineDescriptor, ShaderModuleDescriptor,
    ShaderSource, ShaderStages, StencilState, TextureFormat, VertexState,
};

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct FireParticle {
    pub origin: [f32; 4],
    pub direction: [f32; 4],
    pub birth_time: f32,
    pub lifetime: f32,
    pub size: f32,
    pub _pad: f32,
}

const MAX_FIRE_PARTICLES: u64 = 2048;

pub struct ShaderFire {
    pub render_pipeline: RenderPipeline,
    pub bind_group: BindGroup,
    pub vp_buffer: Buffer,
    pub time_buffer: Buffer,
    pub particle_buffer: Buffer,
    pub particle_count_buffer: Buffer,
}

impl ShaderFire {
    pub fn new(renderer: &Renderer) -> Self {
        let device = &renderer.device;
        let vp_buffer = renderer.create_buffer_init(
            bytemuck::cast_slice(Mat4::IDENTITY.as_ref()),
            BufferUsages::UNIFORM,
        );
        let time_buffer = renderer.create_buffer(size_of::<f32>() as u64, BufferUsages::UNIFORM);
        let particle_buffer = renderer.create_buffer(
            MAX_FIRE_PARTICLES * size_of::<FireParticle>() as BufferAddress,
            BufferUsages::STORAGE | BufferUsages::COPY_DST,
        );
        let particle_count_buffer =
            renderer.create_buffer(size_of::<u32>() as u64, BufferUsages::UNIFORM);

        let bind_group_layout = device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("fire_bind_group_layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::VERTEX | ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&PipelineLayoutDescriptor {
            label: Some("fire_pipeline_layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let module = device.create_shader_module(ShaderModuleDescriptor {
            label: Some("fire_shader"),
            source: ShaderSource::Wgsl(Cow::Borrowed(include_str!("shader_fire.wgsl"))),
        });

        let render_pipeline = device.create_render_pipeline(&RenderPipelineDescriptor {
            label: Some("fire_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: VertexState {
                module: &module,
                entry_point: None,
                compilation_options: PipelineCompilationOptions::default(),
                buffers: &[Vertex::desc()],
            },
            fragment: Some(FragmentState {
                module: &module,
                entry_point: None,
                compilation_options: PipelineCompilationOptions::default(),
                targets: &[Some(renderer.config.view_formats[0].into())],
            }),
            primitive: PrimitiveState {
                front_face: FrontFace::Ccw,
                cull_mode: Some(Face::Back),
                ..Default::default()
            },
            depth_stencil: Some(DepthStencilState {
                format: TextureFormat::Depth32Float,
                depth_write_enabled: true,
                depth_compare: CompareFunction::Less,
                stencil: StencilState::default(),
                bias: DepthBiasState::default(),
            }),
            multisample: MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let bind_group = device.create_bind_group(&BindGroupDescriptor {
            layout: &bind_group_layout,
            entries: &[
                BindGroupEntry {
                    binding: 0,
                    resource: vp_buffer.as_entire_binding(),
                },
                BindGroupEntry {
                    binding: 1,
                    resource: time_buffer.as_entire_binding(),
                },
                BindGroupEntry {
                    binding: 2,
                    resource: particle_buffer.as_entire_binding(),
                },
                BindGroupEntry {
                    binding: 3,
                    resource: particle_count_buffer.as_entire_binding(),
                },
            ],
            label: Some("fire_bind_group"),
        });

        Self {
            render_pipeline,
            bind_group,
            vp_buffer,
            time_buffer,
            particle_buffer,
            particle_count_buffer,
        }
    }

    pub fn write_vp(&self, queue: &Queue, matrix: &[f32; 16]) {
        queue.write_buffer(&self.vp_buffer, 0, bytemuck::bytes_of(matrix));
    }

    pub fn write_time(&self, queue: &Queue, time: f32) {
        queue.write_buffer(&self.time_buffer, 0, bytemuck::bytes_of(&time));
    }

    pub fn write_particles(&self, queue: &Queue, particles: &[FireParticle]) {
        queue.write_buffer(&self.particle_buffer, 0, bytemuck::cast_slice(particles));
        queue.write_buffer(
            &self.particle_count_buffer,
            0,
            bytemuck::bytes_of(&(particles.len() as u32)),
        );
    }
}

impl Shader for ShaderFire {
    fn set_pipeline<'a>(&'a self, pass: &mut RenderPass<'a>, _offset: BufferAddress) {
        pass.set_bind_group(0, &self.bind_group, &[]);
        pass.set_pipeline(&self.render_pipeline);
    }
    fn write_transform_data(&self, _queue: &Queue, _offset: BufferAddress, _matrix: &[f32; 16]) {}
    fn write_rotation_data(&self, _queue: &Queue, _offset: BufferAddress, _matrix: &[f32; 16]) {}
    fn write_time_data(&self, _queue: &Queue, _time: f32) {}
    fn write_camera_data(&self, _queue: &Queue, _matrix: &[f32; 16]) {}
    fn write_light_data(&self, _queue: &Queue, _lights: &[crate::world::Light]) {}
}
