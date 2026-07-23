import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  es: {
    translation: {
      language: { label: 'Idioma', es: 'Español', en: 'English', fr: 'Français' },
      configurator: {
        label: 'Tipo de configurador',
        stl: 'STL',
        image: 'IMG a STL',
        create: 'Crear desde cero',
      },
      common: {
        generate: 'Generar', reset: 'Restablecer', download: 'Descargar',
        show: 'Mostrar', hide: 'Ocultar', setup: 'Configuración',
        finishing: 'Acabado y texturas', customization: 'Personalización', transformInfo: 'Información de transformación',
        wip: 'WIP', workInProgress: 'trabajo en progreso', objects: 'Objetos',
      },
      products: {
        lamp: { name: 'Lámparas', description: 'Convierte modelos STL en lámparas con el mecanismo fijo de Horama.' },
        urn: { name: 'Urnas', description: 'Ajustes de transformación para el flujo de urnas STL.' },
        clicker: { name: 'Clickers', description: 'Cuerpo, tapa, espacio del interruptor y opciones de llavero.' },
        textures: { name: 'Texturas', description: 'Patrones de superficie imprimibles con relieve.' },
        keychains: { name: 'Llaveros', description: 'Herramientas independientes para llaveros próximamente.' },
        image_layers: { name: 'Imagen a capas', description: 'Convierte una imagen de colores reducidos en capas apiladas imprimibles.' },
        signs: { name: 'Letreros', description: 'Letreros personalizados con fuentes locales, paredes huecas y texturas.' },
        bracelet_gems: { name: 'Bracelet Gems', description: 'Letras ensartables para mochilas, loncheras y llaveros.' },
      },
      params: {
        size: { label: 'Tamaño' }, lid_text: { label: 'Texto de la tapa' },
        body_color: { label: 'Color del cuerpo' }, base_color: { label: 'Color de la base' }, lid_color: { label: 'Color de la tapa' }, text_color: { label: 'Color del texto' },
        base_thickness_mm: { label: 'Grosor de la base' }, inner_scale: { label: 'Escala interior' }, planar_cut_base_mm: { label: 'Corte de base' },
        connector_margin_mm: { label: 'Margen del conector' }, fit_clearance_mm: { label: 'Holgura de ensamble', help: 'Aumenta este valor si la base entra demasiado justa después de imprimir.' }, part_gap_mm: { label: 'Separación de piezas' },
        cut_height_mm: { label: 'Altura de corte' }, base_protrusion_mm: { label: 'Saliente de la base' },
        bottom_color: { label: 'Color inferior' }, top_color: { label: 'Color superior' },
        keychain_hole: { label: 'Orificio para llavero' }, keychain_hole_placement: { label: 'Ubicación del llavero' },
        keychain_hole_angle_deg: { label: 'Posición del orificio' }, keychain_hole_inset_mm: { label: 'Mover hacia el origen' },
        texture: { label: 'Textura' }, texture_depth_mm: { label: 'Profundidad de textura' }, texture_spacing_mm: { label: 'Espaciado del patrón' },
        text: { label: 'Texto del letrero' }, bracelet_text: { label: 'Nombre o texto' }, font: { label: 'Fuente' }, font_size_mm: { label: 'Tamaño de letra' },
        letter_spacing_mm: { label: 'Espaciado entre letras' }, line_spacing_mm: { label: 'Espaciado entre líneas' },
        sign_mode: { label: 'Construcción de letras' },
        mirror_hollow: { label: 'Invertir letras (espejo)', help: 'Invierte las letras huecas para que se lean correctamente cuando el lado abierto quede contra la pared o se rellene con LED.' },
        mounting_hole_diameter_mm: { label: 'Diámetro del orificio' },
        mounting_hole_depth_mm: { label: 'Profundidad del orificio', help: 'La cavidad permanece ciega y conserva una superficie frontal sólida.' },
        wall_thickness_mm: { label: 'Grosor de pared' }, wall_height_mm: { label: 'Altura de pared' },
        gem_width_mm: { label: 'Ancho de letra' }, gem_height_mm: { label: 'Alto de letra' }, gem_thickness_mm: { label: 'Altura Z', help: 'Controla la altura de impresión en el eje Z. Para letras de 25 mm se recomiendan entre 4 y 6 mm.' }, thread_orientation: { label: 'Orientación del ensartado' }, piece_spacing_mm: { label: 'Separación de piezas' }, cord_stops: { label: 'Topes de cordón', help: 'Agrega un tope antes y después de las letras.' },
        color_count: { label: 'Colores de material' }, width_mm: { label: 'Ancho impreso' }, layer_height_mm: { label: 'Altura por capa' }, detail_preset: { label: 'Detalle' }, frame_width_mm: { label: 'Ancho del marco' }, background_strategy: { label: 'Fondo' }, layer_order_strategy: { label: 'Orden de capas' }, top_border: { label: 'Borde superior elevado' }, top_border_height_mm: { label: 'Altura del borde superior' },
      },
      options: {
        size: { s: 'Pequeña - 250 ml', m: 'Mediana - 500 ml', l: 'Grande - 1000 ml', xl: 'XL - 2000 ml' },
        keychain_hole_placement: { bottom: 'Base inferior', top: 'Objeto superior' },
        texture: { none: 'Ninguna', woven: 'Tejido', knit: 'Punto', carbon: 'Fibra de carbono', wood: 'Madera' },
        sign_mode: { solid: 'Letras sólidas', hollow: 'Letras huecas', mounting_holes: 'Orificios ciegos de montaje' },
        detail_preset: { draft: 'Borrador', balanced: 'Equilibrado', high: 'Alto' },
        background_strategy: { border: 'Detectar desde el borde', dominant: 'Color dominante', none: 'Sin respaldo completo' },
        layer_order_strategy: { dark_on_top: 'Detalles oscuros arriba', light_on_top: 'Detalles claros arriba' },
        thread_orientation: { vertical: 'Vertical — orificios arriba y abajo', horizontal: 'Horizontal — orificios en los costados' },
      },
      placeholders: { lidText: 'agrega el texto de la tapa', signText: 'Escribe el texto del letrero', braceletText: 'Escribe un nombre o texto' },
      upload: { load: 'Cargar STL', loadImage: 'Cargar imagen', analyzing: 'Analizando STL', select: 'Selecciona un STL local para previsualizar.', selectImage: 'Selecciona una imagen PNG, JPG o WebP.' },
      status: {
        localGenerator: 'Generador local', imageWorkflow: 'Flujo de imagen', loadImage: 'Carga una imagen cuantizada para generar sus capas.', imageReady: 'Imagen cargada. Configura y genera las capas.', generatingImageLayersLocal: 'Generando capas de color localmente...',
        loadStl: 'Carga un STL para inspeccionarlo en el visor', loadValidStl: 'Carga un STL válido para desbloquear la vista 3D.',
        configureSign: 'Configura el letrero y genera una vista previa.', imageWip: 'Este módulo de imagen sigue en desarrollo.', moduleWip: 'Este módulo sigue en desarrollo.',
        configureBracelet: 'Escribe un nombre y configura las letras ensartables.', generatingBracelet: 'Generando Bracelet Gems localmente...',
        parametersUpdated: 'Parámetros actualizados', stlReady: 'STL cargado. Los parámetros están listos.',
        generatingSign: 'Generando el letrero localmente...', generatingLampLocal: 'Generando la lámpara localmente...', generatingClickerLocal: 'Generando el clicker localmente...', generatingTexturesLocal: 'Generando la textura localmente...', generatingUrnLocal: 'Generando la urna localmente...', generated: 'Modelo generado cargado', generationFailed: 'La generación falló',
        movingHole: 'Actualizando la posición del orificio...', holeMoved: 'Posición del orificio actualizada', holeMoveFailed: 'No se pudo mover el orificio',
        defaultsRestored: 'Valores predeterminados restaurados', generatingPreview: 'Generando vista previa',
        preparingStl: 'Preparando STL...', preparingZip: 'Preparando ZIP de STL...', preparing3mf: 'Preparando 3MF con materiales de vista previa...',
        downloaded: 'Descargado: {{filename}}', downloadFailed: 'La descarga falló', loaded: '{{filename}} cargado',
      },
      alerts: { moveHoles: 'Mueve los círculos rojos para elegir la posición de cada orificio.' },
      messages: { transformWarnings: 'Advertencias de transformación', validationWarnings: 'Advertencias de validación', validationIssues: 'Problemas de validación', invalidStl: 'El modelo STL no es válido.', rejectedStl: 'Modelo rechazado. Carga un STL válido para continuar.', validStl: 'El archivo STL se cargó correctamente.', validateFailed: 'No se pudo validar el modelo. Inténtalo de nuevo.', noModel: 'No se produjo un modelo.' },
      viewer: { front: 'Ver frente', mounting: 'Ver lado de montaje', actions: 'Acciones del visor' },
      notes: { clickerReset: 'Después de generar, usa Restablecer para volver al STL original y mostrar nuevamente el plano de corte Z.' },
      info: { size: 'Tamaño', targetCapacity: 'Capacidad objetivo', estimatedCapacity: 'Capacidad estimada', appliedScale: 'Escala aplicada', pressureRibs: 'Nervaduras de presión', colors: 'Colores', layers: 'Capas', processedSize: 'Resolución procesada', physicalSize: 'Tamaño físico', layerHeight: 'Altura por capa', cutHeight: 'Altura de corte', attachmentCenter: 'Centro del mecanismo', attachmentClearance: 'Despeje del mecanismo', effectiveWall: 'Pared efectiva' },
    },
  },
  en: {
    translation: {
      language: { label: 'Language', es: 'Español', en: 'English', fr: 'Français' },
      configurator: { label: 'Configurator type', stl: 'STL', image: 'IMG to STL', create: 'Create from Scratch' },
      common: { generate: 'Generate', reset: 'Reset', download: 'Download', show: 'Show', hide: 'Hide', setup: 'Setup', finishing: 'Finishing and textures', customization: 'Customization', transformInfo: 'Transform info', wip: 'WIP', workInProgress: 'work in progress', objects: 'Objects' },
      products: {
        lamp: { name: 'Lamps', description: 'Turn STL models into lamps with the fixed Horama mechanism.' },
        urn: { name: 'Urns', description: 'Urn transform settings from the STL workflow.' },
        clicker: { name: 'Clickers', description: 'Button body, cap size, switch clearance, and keychain options.' },
        textures: { name: 'Textures', description: 'Raised printable surface patterns.' },
        keychains: { name: 'Keychains', description: 'Standalone keychain tools coming soon.' },
        image_layers: { name: 'Image to Layers', description: 'Convert a reduced-color image into stacked printable layers.' },
        signs: { name: 'Signs', description: 'Custom letter signs with local fonts, hollow walls, and textures.' },
        bracelet_gems: { name: 'Bracelet Gems', description: 'Threadable letters for backpacks, lunch bags, and keychains.' },
      },
      params: {
        size: { label: 'Size' }, lid_text: { label: 'Lid text' }, body_color: { label: 'Body color' }, base_color: { label: 'Base color' }, lid_color: { label: 'Lid color' }, text_color: { label: 'Text color' },
        base_thickness_mm: { label: 'Base thickness' }, inner_scale: { label: 'Inner scale' }, planar_cut_base_mm: { label: 'Base cut' }, connector_margin_mm: { label: 'Connector margin' }, fit_clearance_mm: { label: 'Fit clearance', help: 'Increase this value if the printed base fits too tightly.' }, part_gap_mm: { label: 'Part gap' }, cut_height_mm: { label: 'Cut height' }, base_protrusion_mm: { label: 'Base protrusion' },
        bottom_color: { label: 'Bottom color' }, top_color: { label: 'Top color' }, keychain_hole: { label: 'Keychain hole' }, keychain_hole_placement: { label: 'Keychain placement' }, keychain_hole_angle_deg: { label: 'Hole position' }, keychain_hole_inset_mm: { label: 'Move toward origin' },
        texture: { label: 'Texture' }, texture_depth_mm: { label: 'Texture depth' }, texture_spacing_mm: { label: 'Pattern spacing' }, text: { label: 'Sign text' }, bracelet_text: { label: 'Name or text' }, font: { label: 'Font' }, font_size_mm: { label: 'Letter size' }, letter_spacing_mm: { label: 'Letter spacing' }, line_spacing_mm: { label: 'Line spacing' },
        sign_mode: { label: 'Letter construction' },
        mirror_hollow: { label: 'Mirror letters', help: 'Mirrors hollow letters so they read correctly when the open side faces the wall or is filled with LEDs.' },
        mounting_hole_diameter_mm: { label: 'Hole diameter' }, mounting_hole_depth_mm: { label: 'Hole depth', help: 'The cavity stays blind and always keeps a solid front skin.' }, wall_thickness_mm: { label: 'Wall thickness' }, wall_height_mm: { label: 'Wall height' },
        gem_width_mm: { label: 'Letter width' }, gem_height_mm: { label: 'Letter height' }, gem_thickness_mm: { label: 'Z height', help: 'Controls the printed height on the Z axis. For 25 mm letters, 4–6 mm is recommended.' }, thread_orientation: { label: 'Thread orientation' }, piece_spacing_mm: { label: 'Piece spacing' }, cord_stops: { label: 'Cord stops', help: 'Adds one stop before and after the letters.' },
        color_count: { label: 'Material colors' }, width_mm: { label: 'Printed width' }, layer_height_mm: { label: 'Layer height' }, detail_preset: { label: 'Detail' }, frame_width_mm: { label: 'Frame width' }, background_strategy: { label: 'Background' }, layer_order_strategy: { label: 'Layer order' }, top_border: { label: 'Raised top border' }, top_border_height_mm: { label: 'Top border height' },
      },
      options: { size: { s: 'Small - 250 ml', m: 'Medium - 500 ml', l: 'Large - 1000 ml', xl: 'XL - 2000 ml' }, keychain_hole_placement: { bottom: 'Bottom base', top: 'Top object' }, texture: { none: 'None', woven: 'Woven', knit: 'Knit', carbon: 'Carbon', wood: 'Wood' }, sign_mode: { solid: 'Solid letters', hollow: 'Hollow letters', mounting_holes: 'Blind mounting holes' }, detail_preset: { draft: 'Draft', balanced: 'Balanced', high: 'High' }, background_strategy: { border: 'Detect from border', dominant: 'Dominant color', none: 'No full backing' }, layer_order_strategy: { dark_on_top: 'Dark details on top', light_on_top: 'Light details on top' }, thread_orientation: { vertical: 'Vertical — holes top and bottom', horizontal: 'Horizontal — holes on the sides' } },
      placeholders: { lidText: 'add your lid text here', signText: 'Type the sign text', braceletText: 'Type a name or text' },
      upload: { load: 'Load STL', loadImage: 'Load image', analyzing: 'Analyzing STL', select: 'Select a local STL to preview.', selectImage: 'Select a PNG, JPG, or WebP image.' },
      status: { localGenerator: 'Local generator', imageWorkflow: 'Image workflow', loadImage: 'Load a quantized image to generate its layers.', imageReady: 'Image loaded. Configure and generate the layers.', generatingImageLayersLocal: 'Generating color layers locally...', loadStl: 'Load an STL to inspect it in the viewer', loadValidStl: 'Load a valid STL to unlock the 3D preview.', configureSign: 'Configure the sign and generate a preview.', configureBracelet: 'Enter a name and configure the threadable letters.', imageWip: 'This image module is still in progress.', moduleWip: 'This module is still in progress.', parametersUpdated: 'Parameters updated', stlReady: 'STL loaded. Parameters are ready.', generatingSign: 'Generating sign locally...', generatingBracelet: 'Generating Bracelet Gems locally...', generatingLampLocal: 'Generating lamp locally...', generatingClickerLocal: 'Generating clicker locally...', generatingTexturesLocal: 'Generating texture locally...', generatingUrnLocal: 'Generating urn locally...', generated: 'Generated model loaded', generationFailed: 'Generation failed', movingHole: 'Updating mounting hole position...', holeMoved: 'Mounting hole position updated', holeMoveFailed: 'Could not move the mounting hole', defaultsRestored: 'Defaults restored', generatingPreview: 'Generating preview', preparingStl: 'Preparing STL...', preparingZip: 'Preparing STL ZIP...', preparing3mf: 'Preparing 3MF with preview materials...', downloaded: 'Downloaded {{filename}}', downloadFailed: 'Download failed', loaded: '{{filename}} loaded' },
      alerts: { moveHoles: 'Move the red circle indicators to choose each hole position.' },
      messages: { transformWarnings: 'Transform warnings', validationWarnings: 'Validation warnings', validationIssues: 'Validation issues', invalidStl: 'The STL model is not valid.', rejectedStl: 'Model rejected. Load a valid STL to continue.', validStl: 'The STL file can be loaded correctly.', validateFailed: 'Could not validate the model. Try again.', noModel: 'No model was produced.' },
      viewer: { front: 'View front', mounting: 'View mounting side', actions: 'Viewer actions' },
      notes: { clickerReset: 'After generating, use Reset to return to the original STL and show the Z cut plane again.' },
      info: { size: 'Size', targetCapacity: 'Target capacity', estimatedCapacity: 'Estimated capacity', appliedScale: 'Applied scale', pressureRibs: 'Pressure ribs', colors: 'Colors', layers: 'Layers', processedSize: 'Processed resolution', physicalSize: 'Physical size', layerHeight: 'Layer height', cutHeight: 'Cut height', attachmentCenter: 'Mechanism center', attachmentClearance: 'Mechanism clearance', effectiveWall: 'Effective wall' },
    },
  },
  fr: {
    translation: {
      language: { label: 'Langue', es: 'Español', en: 'English', fr: 'Français' },
      configurator: { label: 'Type de configurateur', stl: 'STL', image: 'IMG vers STL', create: 'Créer de zéro' },
      common: { generate: 'Générer', reset: 'Réinitialiser', download: 'Télécharger', show: 'Afficher', hide: 'Masquer', setup: 'Configuration', finishing: 'Finition et textures', customization: 'Personnalisation', transformInfo: 'Informations de transformation', wip: 'WIP', workInProgress: 'travail en cours', objects: 'Objets' },
      products: {
        lamp: { name: 'Lampes', description: 'Transforme les modèles STL en lampes avec le mécanisme Horama fixe.' },
        urn: { name: 'Urnes', description: 'Réglages de transformation des urnes pour le flux STL.' },
        clicker: { name: 'Clickers', description: 'Corps, capuchon, dégagement de l’interrupteur et options de porte-clés.' },
        textures: { name: 'Textures', description: 'Motifs de surface imprimables en relief.' },
        keychains: { name: 'Porte-clés', description: 'Outils autonomes pour porte-clés bientôt disponibles.' },
        image_layers: { name: 'Image en couches', description: 'Convertit une image aux couleurs réduites en couches imprimables empilées.' },
        signs: { name: 'Enseignes', description: 'Lettres personnalisées avec polices locales, parois creuses et textures.' },
        bracelet_gems: { name: 'Bracelet Gems', description: 'Lettres à enfiler pour sacs, boîtes à lunch et porte-clés.' },
      },
      params: {
        size: { label: 'Taille' }, lid_text: { label: 'Texte du couvercle' }, body_color: { label: 'Couleur du corps' }, base_color: { label: 'Couleur de la base' }, lid_color: { label: 'Couleur du couvercle' }, text_color: { label: 'Couleur du texte' },
        base_thickness_mm: { label: 'Épaisseur de la base' }, inner_scale: { label: 'Échelle intérieure' }, planar_cut_base_mm: { label: 'Coupe de la base' }, connector_margin_mm: { label: 'Marge du connecteur' }, fit_clearance_mm: { label: 'Jeu d’assemblage', help: 'Augmentez cette valeur si la base imprimée est trop serrée.' }, part_gap_mm: { label: 'Écart entre les pièces' }, cut_height_mm: { label: 'Hauteur de coupe' }, base_protrusion_mm: { label: 'Saillie de la base' },
        bottom_color: { label: 'Couleur inférieure' }, top_color: { label: 'Couleur supérieure' }, keychain_hole: { label: 'Trou de porte-clés' }, keychain_hole_placement: { label: 'Emplacement du porte-clés' }, keychain_hole_angle_deg: { label: 'Position du trou' }, keychain_hole_inset_mm: { label: 'Déplacer vers l’origine' },
        texture: { label: 'Texture' }, texture_depth_mm: { label: 'Profondeur de texture' }, texture_spacing_mm: { label: 'Espacement du motif' }, text: { label: 'Texte de l’enseigne' }, bracelet_text: { label: 'Nom ou texte' }, font: { label: 'Police' }, font_size_mm: { label: 'Taille des lettres' }, letter_spacing_mm: { label: 'Espacement des lettres' }, line_spacing_mm: { label: 'Espacement des lignes' },
        sign_mode: { label: 'Construction des lettres' },
        mirror_hollow: { label: 'Inverser les lettres (miroir)', help: 'Inverse les lettres creuses pour qu’elles se lisent correctement lorsque le côté ouvert est contre le mur ou rempli de LED.' },
        mounting_hole_diameter_mm: { label: 'Diamètre du trou' }, mounting_hole_depth_mm: { label: 'Profondeur du trou', help: 'La cavité reste borgne et conserve une face avant solide.' }, wall_thickness_mm: { label: 'Épaisseur de paroi' }, wall_height_mm: { label: 'Hauteur de paroi' },
        gem_width_mm: { label: 'Largeur de lettre' }, gem_height_mm: { label: 'Hauteur de lettre' }, gem_thickness_mm: { label: 'Hauteur Z', help: 'Contrôle la hauteur d’impression sur l’axe Z. Pour des lettres de 25 mm, une valeur de 4 à 6 mm est recommandée.' }, thread_orientation: { label: 'Orientation de l’enfilage' }, piece_spacing_mm: { label: 'Écart entre les pièces' }, cord_stops: { label: 'Arrêts de cordon', help: 'Ajoute un arrêt avant et après les lettres.' },
        color_count: { label: 'Couleurs de matériau' }, width_mm: { label: 'Largeur imprimée' }, layer_height_mm: { label: 'Hauteur de couche' }, detail_preset: { label: 'Détail' }, frame_width_mm: { label: 'Largeur du cadre' }, background_strategy: { label: 'Arrière-plan' }, layer_order_strategy: { label: 'Ordre des couches' }, top_border: { label: 'Bord supérieur surélevé' }, top_border_height_mm: { label: 'Hauteur du bord supérieur' },
      },
      options: { size: { s: 'Petite - 250 ml', m: 'Moyenne - 500 ml', l: 'Grande - 1000 ml', xl: 'XL - 2000 ml' }, keychain_hole_placement: { bottom: 'Base inférieure', top: 'Objet supérieur' }, texture: { none: 'Aucune', woven: 'Tissé', knit: 'Tricot', carbon: 'Carbone', wood: 'Bois' }, sign_mode: { solid: 'Lettres pleines', hollow: 'Lettres creuses', mounting_holes: 'Trous de montage borgnes' }, detail_preset: { draft: 'Brouillon', balanced: 'Équilibré', high: 'Élevé' }, background_strategy: { border: 'Détecter depuis le bord', dominant: 'Couleur dominante', none: 'Sans support complet' }, layer_order_strategy: { dark_on_top: 'Détails foncés au-dessus', light_on_top: 'Détails clairs au-dessus' }, thread_orientation: { vertical: 'Vertical — trous en haut et en bas', horizontal: 'Horizontal — trous sur les côtés' } },
      placeholders: { lidText: 'ajoutez le texte du couvercle', signText: 'Saisissez le texte de l’enseigne', braceletText: 'Saisissez un nom ou un texte' },
      upload: { load: 'Charger un STL', loadImage: 'Charger une image', analyzing: 'Analyse du STL', select: 'Sélectionnez un STL local à prévisualiser.', selectImage: 'Sélectionnez une image PNG, JPG ou WebP.' },
      status: { localGenerator: 'Générateur local', imageWorkflow: 'Flux d’image', loadImage: 'Chargez une image quantifiée pour générer ses couches.', imageReady: 'Image chargée. Configurez et générez les couches.', generatingImageLayersLocal: 'Génération locale des couches de couleur...', loadStl: 'Chargez un STL pour l’inspecter', loadValidStl: 'Chargez un STL valide pour déverrouiller la vue 3D.', configureSign: 'Configurez l’enseigne et générez un aperçu.', configureBracelet: 'Saisissez un nom et configurez les lettres à enfiler.', imageWip: 'Ce module d’image est encore en développement.', moduleWip: 'Ce module est encore en développement.', parametersUpdated: 'Paramètres mis à jour', stlReady: 'STL chargé. Les paramètres sont prêts.', generatingSign: 'Génération locale de l’enseigne...', generatingBracelet: 'Génération locale de Bracelet Gems...', generatingLampLocal: 'Génération locale de la lampe...', generatingClickerLocal: 'Génération locale du clicker...', generatingTexturesLocal: 'Génération locale de la texture...', generatingUrnLocal: 'Génération locale de l’urne...', generated: 'Modèle généré chargé', generationFailed: 'Échec de la génération', movingHole: 'Mise à jour de la position du trou...', holeMoved: 'Position du trou mise à jour', holeMoveFailed: 'Impossible de déplacer le trou', defaultsRestored: 'Valeurs par défaut restaurés', generatingPreview: 'Génération de l’aperçu', preparingStl: 'Préparation du STL ZIP...', preparingZip: 'Préparation du ZIP STL...', preparing3mf: 'Préparation du 3MF avec les matériaux...', downloaded: '{{filename}} téléchargé', downloadFailed: 'Échec du téléchargement', loaded: '{{filename}} chargé' },
      alerts: { moveHoles: 'Déplacez les cercles rouges pour choisir la position de chaque trou.' },
      messages: { transformWarnings: 'Avertissements de transformation', validationWarnings: 'Avertissements de validation', validationIssues: 'Problèmes de validation', invalidStl: 'Le modèle STL n’est pas valide.', rejectedStl: 'Modèle rejeté. Chargez un STL valide pour continuer.', validStl: 'Le fichier STL a été chargé correctement.', validateFailed: 'Impossible de valider le modèle. Réessayez.', noModel: 'Aucun modèle n’a été produit.' },
      viewer: { front: 'Voir l’avant', mounting: 'Voir le côté montage', actions: 'Actions de la visionneuse' },
      notes: { clickerReset: 'Après la génération, utilisez Réinitialiser pour revenir au STL original et afficher le plan de coupe Z.' },
      info: { size: 'Taille', targetCapacity: 'Capacité cible', estimatedCapacity: 'Capacité estimée', appliedScale: 'Échelle appliquée', pressureRibs: 'Nervures de pression', colors: 'Couleurs', layers: 'Couches', processedSize: 'Résolution traitée', physicalSize: 'Taille physique', layerHeight: 'Hauteur de couche', cutHeight: 'Hauteur de coupe', attachmentCenter: 'Centre du mécanisme', attachmentClearance: 'Dégagement du mécanisme', effectiveWall: 'Paroi effective' },
    },
  },
} as const;

const storedLanguage = window.localStorage.getItem('horama-language');
const initialLanguage = storedLanguage && ['es', 'en', 'fr'].includes(storedLanguage)
  ? storedLanguage
  : 'es';

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

document.documentElement.lang = initialLanguage;
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language.split('-')[0];
});

export default i18n;
