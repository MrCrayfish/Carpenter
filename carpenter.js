/*
	Carpenter - A Blockbench plugin that aids the development of MrCrayfish's Furniture Mod
	Copyright (C) 2022  MrCrayfish

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
(function() {
	class FurnitureModel {}
	new Property(FurnitureModel, 'string', 'destination');
	new Property(FurnitureModel, 'boolean', 'textures', {default: true});
	new Property(FurnitureModel, 'string', 'item_model', {default: 'none'});

	var exportAction;
	var furnitureCodec;
	var furnitureFormat;
	var compileEvent;
	var parseEvent;
	
	Plugin.register('carpenter', {
		title: 'Carpenter',
		author: 'MrCrayfish',
		description: 'A utility plugin to aid the development of MrCrayfish\'s Furntiure Mod',
		icon: 'fa-chair',
		version: '0.0.1',
		variant: 'both',
		onload() {
			window.Language.addTranslations('en', {
				'format.furniture_model': 'Furniture Block',
				'dialog.export': 'Export',
				'dialog.furniture_export.title': 'Export Furnture',
				'dialog.furniture_export.destination': 'Destination',
				'dialog.furniture_export.destination.desc': 'The folder which all models will be created',
				'dialog.furniture_export.textures': 'Texture Definitions',
				'dialog.furniture_export.textures.desc': 'If the texture definitions should be included in each model file. Disabling this would mean a child model would define the textures.',
				'dialog.furniture_export.item_model': 'Item Model',
				'dialog.furniture_export.item_model.desc': 'The model that will contain the display properties'
			});

			furnitureCodec = FurnitureCodec();
			furnitureFormat = FurnitureFormat(furnitureCodec);

			exportAction = new Action({
				id: 'export_furniture_models',
				name: 'Export Furniture Models...',
				icon: 'fa-chair',
				description: 'Exports the model for use in MrCrayfish\'s Furniture Mod',
				category: 'file',
				condition: (_) => Format.id === 'furniture_model',
				click: () => {
					ShowExportDialog();
				}
			});
			MenuBar.addAction(exportAction, 'file.export');

			Codecs.project.on('compile', compileEvent = (data) => {
				if(data.model.format == 'furniture_model') {
					const furniture = {};
					for (var key in FurnitureModel.properties) {
						if (FurnitureModel.properties[key].export == false) 
							continue;
						FurnitureModel.properties[key].copy(GetProjectFurnitureObj(), furniture);
					}
					data.model.furniture = furniture;
				}
			});

			Codecs.project.on('parse', parseEvent = (data) => {
				if(data.model.format == 'furniture_model') {
					const furniture = new FurnitureModel();
					for (var key in FurnitureModel.properties) {
						FurnitureModel.properties[key].merge(furniture, data.model.furniture)
					}
					Project.furniture = furniture;
				}
			});
		},
		onunload() {
			furnitureCodec.delete();
			furnitureFormat.delete();
			exportAction.delete();
			MenuBar.update();
			Codecs.project.removeListener('compile', compileEvent);
			Codecs.project.removeListener('parse', parseEvent);
		}
	});

	function ShowExportDialog() {
		const models = {};
		for (let child of Outliner.root) {
			if (child.type === 'group') {
				models[child.name] = child.name;
			}
		}
		var dialog = new Dialog({
			id: 'furntiure_export',
			title: tl('dialog.furniture_export.title') + ` (${Object.keys(models).length} Models)`,
			width: 600,
			buttons: ['dialog.export', 'dialog.cancel'],
			form: {
				destination: {label: 'dialog.furniture_export.destination', type: 'folder', value: GetFurnitureProperty('destination'), description: 'dialog.furniture_export.destination.desc'},
				item_model: {label: 'dialog.furniture_export.item_model', type: 'select', value: GetFurnitureProperty('item_model'), options: Object.assign({'none': 'None'}, models), description: 'dialog.furniture_export.item_model.desc'},
				textures: {label: 'dialog.furniture_export.textures', type: 'checkbox', value: GetFurnitureProperty('textures'), description: 'dialog.furniture_export.textures.desc'},
			},
			onConfirm: (result) => {
				if(result.destination) {
					const orig = GetFurnitureProperty('destination');
					if(orig !== result.destination) {
						SetFurnitureProperty('destination', result.destination);
						Project.saved = false;
					}				
				} else {
					return false;
				}
				if(result.item_model) {
					const orig = GetFurnitureProperty('item_model');
					if(orig !== result.item_model) {
						SetFurnitureProperty('item_model', result.item_model);
						Project.saved = false;
					}	
				}
				if(typeof result.textures !== 'undefined') {
					const orig = GetFurnitureProperty('textures');
					if(orig !== result.textures) {
						SetFurnitureProperty('textures', result.textures);
						Project.saved = false;
					}	
				}
				furnitureCodec.export();
			}
		});
		dialog.show();
	}

	function GetProjectFurnitureObj() {
		if(!Project.furniture) {
			Project.furniture = new FurnitureModel();
		}
		return Project.furniture;
	}

	function GetFurnitureProperty(key) {
		var furniture = GetProjectFurnitureObj();
		return furniture[key];
	}

	function SetFurnitureProperty(key, value) {
		var furniture = GetProjectFurnitureObj();
		return furniture[key] = value;
	}	

	function FurnitureCodec() {
		return new Codec('furniture_model', {
			name: 'Furniture Model',
			remember: false,
			extension: 'json',
			load_filter: {
				type: 'json',
				extensions: ['json'],
				condition(model) {
					return model.parent || model.elements || model.textures;
				}
			},
			compile(options) {
				if (options === undefined)
					options = {}

				function offsetVec(v, o) {
					v[0] = v[0] - o[0];
					v[1] = v[1] - o[1];
					v[2] = v[2] - o[2];
				}

				function computeCube(c, g, s) {
					if (s.export == false) return;
					//Create Element
					var element = {}

					if ((options.cube_name !== false && !settings.minifiedout.value) || options.cube_name === true) {
						if (s.name !== 'cube') {
							element.name = s.name
						}
					}
					element.from = s.from.slice();
					element.to = s.to.slice();
					if (s.inflate) {
						for (var i = 0; i < 3; i++) {
							element.from[i] -= s.inflate;
							element.to[i] += s.inflate;
						}
					}

					// Applies an offset to set the rotation to 8,8,8
					offsetVec(element.from, g.origin);
					offsetVec(element.to, g.origin);

					// Clone to prevent modifying original
					var cubeOrigin = s.origin.slice();
					offsetVec(cubeOrigin, g.origin);

					if (s.shade === false) {
						element.shade = false
					}
					if (!s.rotation.allEqual(0) || !cubeOrigin.allEqual(0)) {
						var axis = s.rotationAxis() || 'y';
						element.rotation = new oneLiner({
							angle: s.rotation[getAxisNumber(axis)],
							axis,
							origin: cubeOrigin
						})
					}
					if (s.rescale) {
						if (element.rotation) {
							element.rotation.rescale = true
						} else {
							element.rotation = new oneLiner({
								angle: 0,
								axis: s.rotation_axis || 'y',
								origin: cubeOrigin,
								rescale: true
							})
						}
					}
					if (s.rotation.positiveItems() >= 2) {
						element.rotated = s.rotation
					}
					var element_has_texture
					var e_faces = {}
					for (var face in s.faces) {
						if (s.faces.hasOwnProperty(face)) {
							if (s.faces[face].texture !== null) {
								var tag = new oneLiner()
								if (s.faces[face].enabled !== false) {
									tag.uv = s.faces[face].uv.slice();
									tag.uv.forEach((n, i) => {
										tag.uv[i] = n * 16 / UVEditor.getResolution(i % 2);
									})
								}
								if (s.faces[face].rotation) {
									tag.rotation = s.faces[face].rotation
								}
								if (s.faces[face].texture) {
									var tex = s.faces[face].getTexture()
									if (tex) {
										tag.texture = '#' + tex.id
										c.textures.safePush(tex)
									}
									element_has_texture = true
								}
								if (!tag.texture) {
									tag.texture = '#missing'
								}
								if (s.faces[face].cullface) {
									tag.cullface = s.faces[face].cullface
								}
								if (s.faces[face].tint >= 0) {
									tag.tintindex = s.faces[face].tint
								}
								e_faces[face] = tag
							}
						}
					}
					//Gather Textures
					if (!element_has_texture) {
						element.color = s.color
					}
					element.faces = e_faces

					// Only push if element has at least one face
					if (Object.keys(element.faces).length) {
						c.elements.push(element);
					}
				}

				function iterate(c, g, arr) {
					var i = 0;
					if (!arr || !arr.length) {
						return;
					}
					for (i = 0; i < arr.length; i++) {
						if (arr[i].type === 'cube') {
							computeCube(c, g, arr[i]);
						} else if (arr[i].type === 'group') {
							iterate(c, g, arr[i].children);
						}
					}
				}

				var components = {};
				for (let child of Outliner.root) {
					if (child.type === 'group') {
						let component = {
							group: child,
							elements: [],
							textures: []
						}
						components[child.name] = component;
						iterate(component, child, child.children);
					}
				}

				function checkExport(key, condition) {
					key = options[key]
					if (key === undefined) {
						return condition;
					} else {
						return key
					}
				}

				console.log(options);

				var blockmodels = {}
				for (let key in components) {
					var component = components[key];

					var isTexturesOnlyModel = component.elements.length === 0;
					var textures = {}
					Texture.all.forEach(function(t, i) {
						var link = t.javaTextureLink()
						if (!component.textures.includes(t) && !isTexturesOnlyModel) return;
						if (t.id !== link.replace(/^#/, '')) {
							textures[t.id] = link
						}
					})

					var blockmodel = {}
					if (checkExport('comment', settings.credit.value)) {
						blockmodel.credit = settings.credit.value
					}
					if (checkExport('ambientocclusion', Project.ambientocclusion === false)) {
						blockmodel.ambientocclusion = false
					}
					if (checkExport('textures', Object.keys(textures).length >= 1)) {
						blockmodel.textures = textures
					}
					if (checkExport('elements', component.elements.length >= 1)) {
						blockmodel.elements = component.elements
					}
					if (checkExport('front_gui_light', Project.front_gui_light)) {
						blockmodel.gui_light = 'front';
					}
					if (checkExport('display', Object.keys(Project.display_settings).length >= 1 && key === options.item_model)) {
						var new_display = {}
						var entries = 0;
						for (var i in DisplayMode.slots) {
							var slot = DisplayMode.slots[i]
							if (DisplayMode.slots.hasOwnProperty(i) && Project.display_settings[slot] && Project.display_settings[slot].export) {
								new_display[slot] = Project.display_settings[slot].export()
								entries++;
							}
						}
						if (entries) {
							blockmodel.display = new_display
						}
					}
					this.dispatchEvent('compile', {
						model: blockmodel,
						options
					});
					blockmodels[key] = blockmodel
				}
				return blockmodels
			},
			write(content, path) {
				var scope = this;

				// Create path if non-existent
				if (!fs.existsSync(path))
					fs.mkdirSync(path);

				for (let key in content) {
					var filePath = PathModule.join(path, key) + '.' + scope.extension;
					Blockbench.writeFile(filePath, {
						content: autoStringify(content[key])
					}, p => scope.afterSave(p));
				}
			},
			export () {
				var scope = this;
				let options = {
					resource_id: 'model',
					type: scope.name,
					extensions: [scope.extension],
					name: scope.fileName(),
					startpath: scope.startPath(),
					content: scope.compile({
						textures: GetFurnitureProperty('textures'),
						item_model: GetFurnitureProperty('item_model')
					}),
					custom_writer: isApp ? (a, b) => scope.write(a, b) : null
				};
				let cb = path => scope.afterDownload(path);
				if (!options.startpath && options.resource_id) {
					options.startpath = StateMemory.dialog_paths[options.resource_id]
				}
				let export_path = GetFurnitureProperty('destination');
				if (options.resource_id) {
					StateMemory.dialog_paths[options.resource_id] = PathModule.dirname(export_path)
					StateMemory.save('dialog_paths')
				}
				Blockbench.writeFile(export_path, options, cb)
			}
		});
	}

	function FurnitureFormat(codec) {
		var format = new ModelFormat({
			id: 'furniture_model',
			extension: 'json',
			icon: 'fa-chair',
			category: 'minecraft',
			target: 'Minecraft: Java Edition',
			render_sides() {
				if (Modes.display && ['thirdperson_righthand', 'thirdperson_lefthand', 'head'].includes(display_slot)) {
					return 'double';
				} else {
					return 'front';
				}
			},
			model_identifier: true,
			parent_model_id: true,
			vertex_color_ambient_occlusion: true,
			rotate_cubes: true,
			rotation_limit: true,
			optional_box_uv: true,
			uv_rotation: true,
			java_face_properties: true,
			animated_textures: true,
			select_texture_for_particles: true,
			display_mode: true,
			texture_folder: true,
			bone_rig: true,
			cube_size_limiter: {
				coordinate_limits: [-16, 32],
				test(cube, values = 0) {
					let from = values.from || cube.from;
					let to = values.to || cube.to;
					let inflate = values.inflate == undefined ? cube.inflate : values.inflate;

					return undefined !== from.find((v, i) => {
						return (
							to[i] + inflate > 32 ||
							to[i] + inflate < -16 ||
							from[i] - inflate > 32 ||
							from[i] - inflate < -16
						)
					})
				},
				move(cube, values = 0) {
					let from = values.from || cube.from;
					let to = values.to || cube.to;
					let inflate = values.inflate == undefined ? cube.inflate : values.inflate;
					
					[0, 1, 2].forEach((ax) => {
						var overlap = to[ax] + inflate - 32
						if (overlap > 0) {
							//If positive site overlaps
							from[ax] -= overlap
							to[ax] -= overlap

							if (16 + from[ax] - inflate < 0) {
								from[ax] = -16 + inflate
							}
						} else {
							overlap = from[ax] - inflate + 16
							if (overlap < 0) {
								from[ax] -= overlap
								to[ax] -= overlap

								if (to[ax] + inflate > 32) {
									to[ax] = 32 - inflate
								}
							}
						}
					})
				},
				clamp(cube, values = 0) {
					let from = values.from || cube.from;
					let to = values.to || cube.to;
					let inflate = values.inflate == undefined ? cube.inflate : values.inflate;
					
					[0, 1, 2].forEach((ax) => {
						from[ax] = Math.clamp(from[ax] - inflate, -16, 32) + inflate;
						to[ax] = Math.clamp(to[ax] + inflate, -16, 32) - inflate;
					})
				}
			},
			codec
		})
		format.allowTinting = true; // Add support for Tint Preview plugin
		codec.format = format;
		return format;
	}
})();