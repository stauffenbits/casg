'use strict';
/*
 four-d.js
 Joshua M. Moore
 April 23, 2015
 depends on: mrdoob's three.js, rev66
 https://github.com/mrdoob/three.js/tree/r66
 tested with r66
 
 This is semantic version v0.1.0.
 See http://semver.org/
 
 The API works as follows:
 Every function or code block marked api is part of the API.
 
 Here's how it works:
 
 var fourd = new FourD(); // instantiation
 fourd.init('#selector', {width: 600, height: 350}); // initialization.
 
 var vertex_options = {
   cube: {
     width: 5, 
     height: 5,
     depth: 5,
     color: 0x000000 // or: texture: 'path_to.png'
     offset: Offset('bottom', 0) // optional
   },
   label: {
		 size: 
     text: 
   }
 }
 
 // or:
 
 var vertex_options = {
   size: 10,
   texture: 'path_to,png'
 }
 
 // or:
 
 // leave out vertex options altogether.
 // default values will be used.
 
 
 var vertex1 = fourd.graph.add_vertex(vertex_options); // add a vertex
 var vertex2 = fourd.graph.add_vertex(vertex_options); // add another vertex
 
 var edge_options = {}; // currently not defined, but this is how you would pass them.
 
 var edge = fourd.graph.add_edge(vertex1, vertex2, edge_options);
 
 fourd.graph.remove_edge(edge); // this is why you keep those variables
 fourd.graph.remove_vertex(vertex1);
 fourd.graph.remove_vertex(vertex2);
 
*/

var FourD = function(){

  var that = this;
  var CONSTANTS = {
    width: 1000,
    attraction: 0.05,
    far: 1000,
    optimal_distance: 10.0,
    minimum_velocity: 0.001,
    friction: 0.60,
    zoom: -25,
    gravity: 10, 
    BHN3: {
      inner_distance: 0.36,
      repulsion: 25.0,
      epsilon: 0.1
    }
  };
  
  var is_vertex = function(potential){
    return true;
		/*potential.hasOwnProperty('id') && 
      potential.hasOwnProperty('edge_count') && 
      potential.hasOwnProperty('edges');
			*/
  };

  /* 
    Vertex
    
    Creates a vertex which can be passed to Graph. 
    setting a label property in the options parameter can allow
    for a label to be drawn above or below a vertex. 
    
    Options:
    - invisible
    - see cube
    - see label
    
  */
  var Vertex = function(id, options){
    this.options = options || {};
    this.id = id;
    
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.acceleration = new THREE.Vector3(0, 0, 0);
    
    this.toString = function(){
      return this.id.toString();
    };

    this.edge_count = 0;
    this.edges = {};

    this.texture = null;
    
    if(!this.options.hasOwnProperty('label')){
      this.options.label = {
        text: '',
        direction: 'x',
        distance: '10'
      };
    };
  };

  var getPicture = function(options){
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    var fontSize = options.size || 100;
    context.font = fontSize + "px Consolas";
    var measurements = context.measureText(options.text);
    //canvas.width = measurements.width + 10;
    //canvas.height = fontSize + 2;
    context.height = fontSize;
		context.width = measurements.width;
    context.fillText(options.text, 0, fontSize);
    
    return canvas;
  };

  var Label = function(options){
    // thanks, https://codepen.io/dxinteractive/pen/reNpOR
    var _createTextLabel = function() {
      var div = document.createElement('label');
      document.body.appendChild(div);
      div.className = 'text-label';
      div.style.position = 'absolute';
      div.style.width = 100;
      div.style.height = 100;
      div.innerHTML = options.text;
      div.style.top = -1000;
      div.style.left = -1000;
      
      var _this = this;
 
      var label = {
        element: div,
        parent: options.object,
        position: new THREE.Vector3(),
        updatePosition: function(camera) {
          if(parent) {
            this.position.copy(this.parent.position);
          }
          
          var coords2d = this.get2DCoords(this.position, camera);
          this.element.style.left = coords2d.x + 'px';
          this.element.style.top = coords2d.y + 'px';
        },
        get2DCoords: function(position, camera) {
          var vector = position.project(camera);
          vector.x = (vector.x + 1)/2 * window.innerWidth;
          vector.y = -(vector.y - 1)/2 * window.innerHeight + options.offset;
          return vector;
        },
        remove: () => {
          console.log('remove');
          document.body.removeChild(div);
        }
      };

      options.vertex.label = label;
      return label;
    };

    var label = _createTextLabel();
    if(Label.all){
      Label.all.push(label);
    }else{
      Label.all = [label];
    }
    return label;

		//var sprite = makeTextSprite(options.text, options);
    // return sprite;
  };

  Label.all = [];
  
  Vertex.prototype.paint = function(scene){
    this.object = new THREE.Group();
    this.object.position.set(
      Math.random(),
      Math.random(),
      Math.random()
    );
    
    if(!this.options){
      this.options = {
        cube: {
          size: 10, 
          color: 0xffffff,
          wireframe: false
        }
      };
    }

    if(this.options.cube){
      this.cube = new Cube(this.options.cube);
      this.texture = this.options.cube.texture;
      this.color = this.options.cube.color;
      
			this.cube.geometry.computeFaceNormals();
      this.object.add(this.cube);
      this.cube.position.set(0, 0, 0);
			this.cube.vertex = this;
    }
    if(this.options.label && this.options.label.text){
      this.options.label.object = this.object;
      this.options.label.vertex = this;
      this.label = new Label(this.options.label);
      this.label.element.vertex = this;
      this.label.element.id = `vertex-label-${this.id}`;
    }
    
    scene.add(this.object);
  };

  Vertex.prototype.set = function(options){
    if(options.color !== undefined){
      this.cube.material.color = options.color;
      this.cube.material.needsUpdate = true;
    }
    if(options.texture !== undefined){
      this.cube.material.map = new THREE.TextureLoader().load( options.texture );
      this.cube.material.needsUpdate = true;
      this.texture = options.texture;
    }
    if(options.text !== undefined){
      this.label.element.innerHTML = options.text;
    }
  };
  
  /* 
    Vertex.remove(...) 
    removes either a label: Vertex.remove('label'),
    or the vertex's cube: Vertex.remove('cube').
  */ 
  Vertex.prototype.remove = function(name){
    if(this.label){
      this.label.remove();
    }
    this.object.remove(name);
  }

  var CameraVertex = function(id, camera){
      Vertex.call(this, id);
      this.object = camera;
      this.id = id;
  };
  CameraVertex.prototype = Object.create(Vertex.prototype);
  CameraVertex.prototype.constructor = CameraVertex;
	
  // Edge
  var Edge = function(id, source, target, options){
    this.options = options === undefined ? {strength: 1.0} : options;
    
    if(arguments.length < 3){
      throw new Error('Edge without sufficent arguments');
    }

    if(!is_vertex(source)){
      var source_type = typeof source;
      var source_error_msg = 'Source should be a Vertex instead of a ' + source_type + '.';
      throw new Error(src_error_msg);
    }

    if(!is_vertex(target)){
      var target_type = typeof target;
      var target_error_msg = 'Target should be a Vertex instead of a ' + target_type + '.';
      throw new Error(tgt_error_msg);
    }

    this.id = id;

    this.source = source;
    this.target = target;

    this.source.edge_count += 1;
    this.target.edge_count += 1;

    if(!this.source.edges) this.source.edges = [];
    if(!this.target.edges) this.target.edges = [];
    this.source.edges[this.id] = this;
    this.target.edges[this.id] = this;

    this.order = Math.random();
  };

  Edge.prototype.paint = function(scene, options){
    options = options || {
      color: 0xffffff,
      paint: true
    }
    this.object = line(scene, this.source, this.target, options);
  };

  Edge.prototype.toString = function(){
    return this.source.toString() + '-->' + this.target.toString(); 
  };

  Edge.prototype.destroy = function(scene){
    delete this.source.edges[this.id];
    delete this.target.edges[this.id];

    CONSTANTS.scene.remove(this.object);
    delete this.object;
    
    this.source.edge_count--;
    this.target.edge_count--;
  };
	
  // Graph
  var Graph = function(scene){
    this.scene = scene;
    this.type = 'Graph';
    this.vertex_id_spawn = 0;
    this.V = {};

    this.edge_id_spawn = 0;
    this.E = {};

    this.edge_counts = {};
  };

  // api
  Graph.prototype.clear = function(){

    for(var e in this.E){
      this.E[e].destroy(that.scene);
    }

    for(var v in this.V){
      // this.scene.remove...
      scene.remove(this.V[v].object);
      // this.V[v].destroy();
    }
    
    this.V = {};
    this.E = {};
    this.edge_counts = {};
    this.edge_id_spawn = 0;
    this.vertex_id_spawn = 0;
  };

  Graph.prototype._make_key = function(source, target){
    return '_' + source.toString() + '_' + target.toString();
  };

  // api
  Graph.prototype.add_vertex = function(options){
    options = options || {};
    
    var v = new Vertex(this.vertex_id_spawn++, options);
    v.paint(this.scene);
    this.V[v.id] = v;
    v.object.vertex = v;
    
    return v;
  };

  Graph.prototype.add_camera_vertex = function(camera){
    var v = new CameraVertex(this.vertex_id_spawn++, camera);
    v.position = v.object.position;
    this.V[v.id] = v;
    return v;
  };

  // api
  Graph.prototype.add_edge = function(source, target, options){
    var key = '_' + source.id + '_' + target.id;
    var edge;
    
    if(!this.edge_counts.hasOwnProperty(key)){
      edge = new Edge(this.edge_id_spawn++, source, target, options);
      this.E[edge.id] = edge;
      this.edge_counts[key] = 1;
    }else{
      this.edge_counts[key]++;
      for(var e in target.edges){
        for(var r in source.edges){
          if(e === r){
            return source.edges[r];
          }
        }
      }
    }
    
    edge.paint(this.scene);
    return edge;
  };
	
	Graph.prototype.add_invisible_edge = function(source, target){
		return this.add_edge(source, target, {opacity: 0.0});
	}

  // api
  Graph.prototype.remove_edge = function(edge){
    edge.destroy();
    delete this.E[edge.id];
  };

  Graph.prototype.toString = function(){
    var edges = Object.keys(this.E).length;
    var nodes = Object.keys(this.V).length;

    return '|V|: ' + nodes.toString() + ', |E|: ' + edges.toString();
  };

  // api
  Graph.prototype.remove_vertex = function(vertex){

    console.log('remove', vertex);
    if(vertex.label){
      console.log('remove label')
      vertex.label.remove();
    }

    for(var e in vertex.edges){
      vertex.edges[e].destroy(this.scene);  
      delete this.E[e];
    }
    
    this.scene.remove(vertex.object);
    delete this.V[vertex.id];
  };

  var is_graph = function(potential){
    return potential.type === 'Graph';
  };

  // apiish
  var Cube = function(options){
    if(options === undefined){
      options = {};
    }
    
    if(options.width === undefined){
      options.width = 3;
    }
    if(options.height === undefined){
      options.height = 3;
    }
    if(options.depth === undefined){
      options.depth = 3;
    }
    if(options.color === undefined){
      options.color = 0xffffff;
    }
    
    if(options.wireframe === undefined){
      options.wireframe = false;
    }
    
    var geometry, material, material_args;
    geometry = new THREE.BoxGeometry(
      options.width,
      options.height,
      options.depth
    );
    geometry.dynamic = true;
    
    if(options.texture !== undefined){
      material_args = { 
        map: new THREE.TextureLoader().load( options.texture )
      };
      
    }else{
      material_args = { 
        color: options.color,
        wireframe: options.wireframe
      };
    }

    material = new THREE.MeshBasicMaterial( material_args );
    
    var cube = new THREE.Mesh( geometry, material );
    var scale = 2;
    cube.position.set(
      Math.random() * scale, 
      Math.random() * scale,
      Math.random() * scale
    );
    cube.matrixAutoUpdate = true;
    
    return cube;
  };

  // apiish this will change
  // todo: make line options like cube options
  var line = function(scene, source, target, options){
    var geometry = new THREE.Geometry();
    geometry.dynamic = true;
    geometry.vertices.push(source.object.position);
    geometry.vertices.push(target.object.position);
    geometry.verticesNeedUpdate = true;
    
		options = options || {};
		options.color = options.color ? options.color : 0xffffff;
		options.transparent = options.transparent ? options.transparent : false;
		options.opacity = options.opacity ? options.opacity : 1.0;
		
    var material = new THREE.LineBasicMaterial(options);
    
    var line = new THREE.Line( geometry, material );
    line.frustumCulled = false;
      
    scene.add(line);
    return line;
  };

  var BHN3 = function(){
    this.inners = [];
    this.outers = {};
    this.center_sum = new THREE.Vector3(0, 0, 0);
    this.center_count = 0;
  };

  BHN3.prototype.constants = CONSTANTS.BHN3;

  BHN3.prototype.center = function(){
    return this.center_sum.clone().divideScalar(this.center_count);
  };

  BHN3.prototype.place_inner = function(vertex){
    this.inners.push(vertex);
    this.center_sum.add(vertex.object.position);
    this.center_count += 1;
  };

  BHN3.prototype.get_octant = function(position){
    var center = this.center();
    var x = center.x < position.x ? 'l' : 'r';
    var y = center.y < position.y ? 'u' : 'd';
    var z = center.z < position.z ? 'i' : 'o';
    return x + y + z;
  };

  BHN3.prototype.place_outer = function(vertex){
    var octant = this.get_octant(vertex.object.position);
    this.outers[octant] = this.outers[octant] || new BHN3();
    this.outers[octant].insert(vertex);
  };

  BHN3.prototype.insert = function(vertex){
    if(this.inners.length === 0){
      this.place_inner(vertex);
    }else{
      if(this.center().distanceTo(vertex.object.position) <= this.constants.inner_distance){
        this.place_inner(vertex);
      }else{
        this.place_outer(vertex);
      }
    }
  };

  BHN3.prototype.estimate = function(vertex, force, force_fn){
    if(this.inners.indexOf(vertex) > -1){
      for(var i=0; i<this.inners.length; i++){
        if(vertex !== this.inners[i]){
          var individual_force = force_fn(
            vertex.object.position.clone(),
            this.inners[i].object.position.clone()
          );
	  
          force.add(individual_force);
        }
      }
    }else{
      var sumstimate = force_fn(vertex.object.position, this.center());
      sumstimate.multiplyScalar(this.center_count);
      force.add(sumstimate);
    }
    
    for(var octant in this.outers){
      this.outers[octant].estimate(vertex, force, force_fn);
    }
  };

  BHN3.prototype.pairwise_repulsion = function( x1, x2 ){

    var enumerator1, denominator1, 
      enumerator2, denominator2, 
      repulsion_constant, 
      difference, absolute_difference, 
      epsilon, product, 
      term1, term2,
      square, sum, result; 
    
    // first term
    enumerator1 = repulsion_constant = CONSTANTS.BHN3.repulsion;
    
    difference = x1.clone().sub(x2.clone());
    absolute_difference = difference.length();
    
    epsilon = CONSTANTS.BHN3.epsilon;
    sum = epsilon + absolute_difference;
    denominator1 = square = sum*sum;
    
    term1 = enumerator1 / denominator1;
    
    // second term
    enumerator2 = difference;
    denominator2 = absolute_difference;
    
    term2 = enumerator2.divideScalar(denominator2);
    
    // result
    result = term2.multiplyScalar(term1);  
    
    return result;
  };
  
  var edges = false;
  Graph.prototype.layout = function(){

    // calculate repulsions
    var tree = new BHN3();
    var vertex, edge, v, e;
    
    for(v in this.V){
      vertex = this.V[v];
      vertex.acceleration = new THREE.Vector3(0.0, 0.0, 0.0);
      vertex.repulsion_forces = new THREE.Vector3(0.0, 0.0, 0.0);
      vertex.attraction_forces = new THREE.Vector3(0.0, 0.0, 0.0);

      tree.insert(vertex);
    }
    
    for(v in this.V){
      vertex = this.V[v];
      vertex.repulsion_forces = vertex.repulsion_forces || new THREE.Vector3();
      vertex.repulsion_forces.set(0.0, 0.0, 0.0);
      tree.estimate(
        vertex, vertex.repulsion_forces,
        BHN3.prototype.pairwise_repulsion
      );
    }
    
    // calculate attractions
    
    for(e in this.E){
      edge = this.E[e];
      
      var attraction = edge.source.object.position.clone().sub(
        edge.target.object.position
      );
      attraction.multiplyScalar(-1 * CONSTANTS.attraction);

      // attraction.multiplyScalar(edge.options.strength);

      edge.source.attraction_forces.sub(attraction);
      edge.target.attraction_forces.add(attraction);

      if(edge.options.directed){
        var distance = edge.object.geometry.vertices[0].distanceTo(edge.object.geometry.vertices[1]);
        var gravity = new THREE.Vector3(0.0, CONSTANTS.gravity/distance, 0.0);
        attraction.add(gravity);
      }
    }
    
    for(v in this.V){
      // update velocity
      vertex = this.V[v];
      if(vertex){
        var friction = vertex.velocity.multiplyScalar(CONSTANTS.friction);

        vertex.acceleration.add(
          vertex.repulsion_forces.clone().add(
            vertex.attraction_forces.clone().negate()
          )
        );
        vertex.acceleration.sub(friction);
        
        vertex.velocity.add(vertex.acceleration);
        vertex.object.position.add(vertex.velocity);
      }
    }
    
    for(e in this.E){
      edge = this.E[e];

      if(edge){  
        edge.object.geometry.dirty = true;
        edge.object.geometry.__dirty = true;
        edge.object.geometry.verticesNeedUpdate = true;
      }
    }

    this.center = tree.center();
  };
	
	Graph.prototype.add_cycle = function(vertex_options){
		var vertices = [];
		var edges = [];
		for(var i=0; i<vertex_options.length; i++){
			vertices.push(this.add_vertex(vertex_options[i]));
			if(i>0){
				edges.push(this.add_edge(vertices[i-1], vertices[i]));
			}
		}
		edges.push(this.add_edge(vertices[0], vertices[vertices.length-1]));
		
		return {
			vertices: vertices,
			edges: edges
		};
	};
	
	Graph.prototype.remove_cycle = function(cycle){
		for(var i=0; i<cycle.edges.length; i++){
			this.remove_edge(cycle.edges[i]);
		}
		for(var i=0; i<cycle.vertices.length; i++){
			this.remove_vertex(cycle.vertices[i]);
		}
	};

	this.select = function(vertex){
		if(!vertex) return;
		
		if(that.selected){
			that.graph.remove_edge(that.camera_edge);
			delete that.camera_edge;
			that.graph.remove_vertex(that.camera_vertex);
			delete that.camera_vertex;
		}
		
		var camera = that._internals.camera;
		that.camera_vertex = that.graph.add_camera_vertex(camera);
		that.camera_edge = that.graph.add_invisible_edge(vertex, that.camera_vertex);
		that.selected = vertex;
	};
	
	this.deselect = function(){
		that.selected = null;
		that.graph.remove_edge(that.camera_edge);
		delete that.camera_edge;
		that.graph.remove_vertex(that.camera_vertex);
		delete that.camera_vertex;
		
		that.selected = null;
	}
  
  this._internals = {};
  var scene,
      element,
      camera,
      light,
      renderer,
      graph,
      controls,
      clock, 
      raycaster,
      mouse,
      intersects,
			render_loop = [];
      
  var old_intersects,
      old_color;
	var that = this;
  var render = function render(){
    requestAnimationFrame(render);

    graph.layout();
    controls.update(clock.getDelta());
    
    for(var i=0; i<that.render_loop.length; i++){
      that.render_loop[i]();
    }
      
    if(that.selected){
      camera.lookAt(that.selected.position);
    }

    for(var i=0; i<Label.all.length; i++){
      Label.all[i].updatePosition(camera);
    }
    
    renderer.render(scene, camera);
  };

  var clear = function clear(){
    graph.clear();
  };
  
  // api
  this.init = function(selector, options){
    var settings = $.extend({
      border: '1px solid black',
      width: 500,
      height: 250,
      background: 0x004477,
    }, options);
    
    scene = new THREE.Scene();
    if(typeof selector === "string"){
      element = document.querySelector(selector);
    }else{
      element = selector;
    }
    if(!element){
      throw "element " + selector + " wasn't found on the page.";
    }
    
    $(element).css({
      border: 0,
      margin: 0,
      padding: 0
    });
    $(element).width(settings.width);
    $(element).height(settings.height);
    
    camera = new THREE.PerspectiveCamera(
      70,
      settings.width / settings.height,
      1,
      CONSTANTS.far
    );
    light = new THREE.PointLight( 0xf0f0f0 ); // soft white light
    
    CONSTANTS.scene = scene;
    scene.add( camera );
    scene.add( light );

    /*
    if(options.background){
      scene.background = new THREE.TextureLoader().load(options.background);
    }
    */
    
    renderer = new THREE.WebGLRenderer();
    renderer.setClearColor(settings.background);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize( settings.width, settings.height );
    
    $(element).append( renderer.domElement );
    $(renderer.domElement).css({
      margin: 0,
      padding: 0,
      border: settings.border
    })
    
    graph = new Graph(scene);
    
    camera.position.z = -250;
    camera.lookAt(new THREE.Vector3(0, 0, 0));
    
    THREEx.WindowResize(renderer, camera);

    clock = new THREE.Clock();
    controls = new THREE.OrbitControls( camera, renderer.domElement );
    controls.update(clock.getDelta()); 
    controls.movementSpeed = 250;
    controls.domElement = renderer.domElement;
    controls.rollSpeed = Math.PI / 12;
    controls.autoForward = false;
    controls.dragToLook = true;
    
    that.intersect_callback = function(object){
      console.log(object.vertex);
    };

    that.resolve_click = function(event){
      if(event.target === renderer.domElement){
        var raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();
        mouse.x = ( event.clientX / renderer.domElement.width ) * 2 - 1;
        mouse.y = - ( event.clientY / renderer.domElement.height ) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        intersects = raycaster.intersectObjects(scene.children, true);

        if(intersects.length > 0){
          return intersects[0].object.vertex;
        }else{
          return null;
        }
      }
    };
    
    var onMouseDown = function(event){
      if(event.target === renderer.domElement){
        var raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();
        mouse.x = ( event.clientX / renderer.domElement.width ) * 2 - 1;
        mouse.y = - ( event.clientY / renderer.domElement.height ) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        intersects = raycaster.intersectObjects(scene.children, true);

        if(typeof that.on_mouse_down == 'function'){
          if(intersects.length > 0){
            that.on_mouse_down(intersects[0].object.vertex);
          }else{
            that.on_mouse_down(null);
          }
        }
        
        if(intersects.length > 0){
          that.selected = intersects[0].vertex;
        }
        
        if(intersects.length > 0 && typeof that.intersect_callback == 'function'){
          that.intersect_callback(intersects[0].object, event);
        }
      }
    }
    // $(element).on('mousedown', onMouseDown);
    
    that._internals = {
      scene: scene,
      element: element,
      camera: camera,
      light: light,
      renderer: renderer,
      graph: graph,
      controls: controls,
      clock: clock, 
      raycaster: raycaster,
      mouse: mouse,

      Vertex: Vertex,
      Edge: Edge,
      CameraVertex: CameraVertex,
      BHN3: BHN3
    };

    // api
    this.version = "0.1.0";
    this.graph = graph;
    this.render = render;
    this.clear = clear;
		this.render_loop = render_loop;
    this.variables = CONSTANTS;

    render();
  };

  // untested
  this.setCubeFn = function(fn){
    cube = fn;
  };

  this.setLineFn = function(fn){
    line = fn;
  };
  // end untested
  
  return this;
};
