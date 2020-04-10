/*
  jquery.fourd.js
  Joshua Moore
  moore.joshua@pm.me
  
  May the 4th, 2018
  
  A jquery plugin for creating fourd graphs. 
*/

(function($){

  var fourd = null;
  
  $.widget('jmm.fourd', {
    options: {
      background: 0x004477,
      border: '1px solid black',
      width: document.innerWidth,
      height: document.innerHeight
    },

    _create: function(){
      $(this).css($.extend({
        display: "block",
        border: this.options.border
      }, this.options));

      $(this).width(this.options.width);
      $(this).height(this.options.height);
      
      fourd = new FourD();
      fourd.init(this.element, {
        width: this.options.width,
        height: this.options.height,
        background: this.options.background
      });
      
      $(this).addClass('fourd');

      return this;
    },

    _destroy: function(){
      $(this).removeClass('fourd')
      fourd.clear();
      delete fourd;
    },

    add_vertex: function(options){
      var settings = $.extend({
        size: 10, 
        wireframe: false
      }, options);
      return fourd.graph.add_vertex(settings);
    },

    remove_vertex: function(v){
      return fourd.graph.remove_vertex(v);
    },

    add_edge: function(v0, v1, options){
      var settings = $.extend({}, options)
      return fourd.graph.add_edge(v0, v1, settings);
    },

    remove_edge: function(e){
      fourd.remove_edge(e);
    },

    clear: function(){
      fourd.clear();
    },

    vertices: function(){
      return fourd.graph.V;
    },

    edges: function(){
      return fourd.graph.E;
    },
    
    underlying_object: function(){
      return fourd;
    },
    
    camera: function(){
      return fourd._internals.camera;
    },
    
    element: function(){
      return $(fourd._internals.element);
    },
    
    selected: function(){
      return fourd.selected;
    }

  });
  
}(jQuery));