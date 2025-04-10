import React, { useState, useRef, useCallback } from "react";
import Uppy from "@uppy/core";
import Tus from "@uppy/tus";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

const ImageUploader = () => {
    const [images, setImages] = useState([]);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const uppyRef = useRef(null);

    // Initialisation d'Uppy
    React.useEffect(() => {
        uppyRef.current = new Uppy({
            id: "uppy",
            autoProceed: false, // Désactiver l'upload automatique
            allowMultipleUploadBatches: true,
            restrictions: {
                maxFileSize: 5000000, // 5MB
                allowedFileTypes: ["image/*"],
            },
        })
            .use(Tus, {
                endpoint: "https://tusd.tusdemo.net/files/", // Remplacer par votre endpoint tus
                retryDelays: [0, 1000, 3000, 5000],
            })
            .on("upload-success", (file, response) => {
                const imageUrl = response.uploadURL || URL.createObjectURL(file.data);

                // Trouver l'index correspondant au fichier en attente pour préserver l'ordre
                const matchingPendingFile = pendingFiles.find(pf =>
                    pf.name === file.name &&
                    pf.file.size === file.data.size
                );

                const index = matchingPendingFile ? matchingPendingFile.index : images.length;

                setImages((prevImages) => [
                    ...prevImages,
                    {
                        id: file.id,
                        name: file.name,
                        url: imageUrl,
                        index,
                    },
                ]);

                // Supprimer le fichier en attente correspondant
                if (matchingPendingFile) {
                    setPendingFiles(prev =>
                        prev.filter(pf => pf.id !== matchingPendingFile.id)
                    );
                }
            })
            .on("upload-error", (file, error) => {
                console.error("Upload error:", error);
                setIsUploading(false);
            })
            .on("complete", () => {
                console.log("Complete");
                setIsUploading(false);
                setPendingFiles([]);
            });

        return () => {
            if (uppyRef.current) {
                uppyRef.current.destroy();
            }
        };
    }, [pendingFiles]);

    const handleUploadClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            // Créer des aperçus locaux pour les fichiers sélectionnés
            const newPendingFiles = Array.from(files).map(file => ({
                id: `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: file.name,
                url: URL.createObjectURL(file),
                file: file,
                isPending: true,
                index: pendingFiles.length + images.length,
            }));

            setPendingFiles(prevPendingFiles => [...prevPendingFiles, ...newPendingFiles]);
        }
    };

    const handleDragEnd = useCallback((result) => {
        if (!result.destination) return;

        // Combiner les images téléchargées et en attente pour le réordonnancement
        const allItems = [...images, ...pendingFiles];
        const items = Array.from(allItems);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        // Mettre à jour les indices après réorganisation et séparer à nouveau les listes
        const updatedItems = items.map((item, index) => ({
            ...item,
            index,
        }));

        // Séparer les images téléchargées et en attente
        const updatedImages = updatedItems.filter(item => !item.isPending);
        const updatedPendingFiles = updatedItems.filter(item => item.isPending);

        setImages(updatedImages);
        setPendingFiles(updatedPendingFiles);
    }, [images, pendingFiles]);

    const handleCreateExperiment = () => {
        // Uploader tous les fichiers en attente
        if (pendingFiles.length > 0) {
            setIsUploading(true);

            // Ajouter tous les fichiers en attente à Uppy
            pendingFiles.forEach(pendingFile => {
                uppyRef.current.addFile({
                    name: pendingFile.name,
                    type: pendingFile.file.type,
                    data: pendingFile.file,
                    meta: {
                        pendingId: pendingFile.id, // Stocker l'ID du fichier en attente pour le retrouver
                        index: pendingFile.index   // Préserver l'index pour l'ordre
                    }
                });
            });

            // Démarrer l'upload
            uppyRef.current.upload();
        } else {
            // Logique pour créer l'expérience avec les images déjà ordonnées
            console.log("Images ordonnées:", images);
            // Appel API ou autre logique ici
        }
    };

    // Fonction pour rendre la grille d'images
    const renderImageGrid = () => {
        // Combiner les images déjà téléchargées et celles en attente
        const allImages = [...pendingFiles];

        // Trier par index pour maintenir l'ordre
        allImages.sort((a, b) => a.index - b.index);

        // Si aucune image, ne pas rendre le système de drag and drop
        if (allImages.length === 0) {
            return (
                <div className="empty-state">
                    <p className="text-gray-600 text-center">No images selected yet. Select some images to begin.</p>
                </div>
            );
        }

        return (
            <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable
                    droppableId="images"
                    direction="horizontal"
                    isDropDisabled={false}
                    isCombineEnabled={false}
                    ignoreContainerClipping={false}
                    type="DEFAULT"
                >
                    {(provided, snapshot) => (
                        <div
                            className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-4 mb-8 max-h-[500px] overflow-y-auto p-1 ${snapshot.isDraggingOver ? 'bg-blue-50' : ''}`}
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                        >
                            {allImages.map((image, index) => (
                                <Draggable
                                    key={String(image.id)}
                                    draggableId={String(image.id)}
                                    index={index}
                                    isDragDisabled={isUploading}
                                    disableInteractiveElementBlocking={true}
                                >
                                    {(provided, snapshot) => (
                                        <div
                                            className={`relative rounded-lg overflow-hidden bg-gray-100 shadow cursor-grab flex flex-col ${snapshot.isDragging ? 'shadow-md' : 'shadow-sm'}`}
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            {...provided.dragHandleProps}
                                            style={{
                                                ...provided.draggableProps.style
                                            }}
                                        >
                                            <div className="absolute top-1 left-1 bg-black bg-opacity-60 text-white text-xs font-bold px-1.5 py-0.5 rounded z-10">
                                                {String(index + 1).padStart(2, '0')}
                                            </div>
                                            <div className="w-full h-[100px] overflow-hidden">
                                                <img
                                                    src={image.url}
                                                    alt={image.name}
                                                    className="w-full h-full object-cover"
                                                />

                                            </div>
                                            <div className="text-xs text-gray-600 p-1 whitespace-nowrap overflow-hidden text-ellipsis bg-gray-100">
                                                {image.name}
                                            </div>
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        );
    };

    return (
        <div className="bg-white rounded-lg shadow-lg w-[90%] max-w-[900px] mx-auto p-5 relative">
            <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-medium m-0 text-gray-800">Upload images</h2>
                <button className="bg-transparent border-0 text-2xl cursor-pointer text-gray-400">&times;</button>
            </div>

            <p className="text-gray-600 mb-5 text-sm">
                Please make sure your images are correctly ordered according to your experiment setup
            </p>

            {/* Rendu de la grille d'images */}
            {renderImageGrid()}

            <div className="flex justify-center mb-5">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                    multiple
                    accept="image/*"
                />
                <button
                    className="flex items-center justify-center bg-white border border-gray-300 rounded px-4 py-2 text-sm text-gray-700 cursor-pointer transition hover:bg-gray-100 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed before:content-['↑'] before:mr-2"
                    onClick={handleUploadClick}
                    disabled={isUploading}
                >
                    {isUploading ? "Uploading..." : "Select more images"}
                </button>
            </div>

            <button
                className="block w-full bg-blue-500 text-white border-0 rounded py-3 text-base font-medium cursor-pointer transition hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed"
                onClick={handleCreateExperiment}
                disabled={(images.length === 0 && pendingFiles.length === 0) || isUploading}
            >
                {isUploading ? "Uploading..." : `Create Experiment${pendingFiles.length > 0 ? " & Upload Images" : ""}`}
            </button>
        </div>
    );
};

export default ImageUploader;