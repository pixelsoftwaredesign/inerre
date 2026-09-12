// PixelSoftwareDesign2026@
package com.inerre;

import javafx.application.Application;
import javafx.geometry.*;
import javafx.scene.*;
import javafx.scene.control.*;
import javafx.scene.input.*;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.scene.paint.PhongMaterial;
import javafx.scene.shape.*;
import javafx.scene.transform.Rotate;
import javafx.scene.transform.Translate;
import javafx.stage.Stage;
import javafx.stage.FileChooser;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

import com.google.gson.*;

public class App extends Application {

    private Group root3D = new Group();
    private Group terrainGroup = new Group();
    private PerspectiveCamera camera = new PerspectiveCamera(true);
    private double mouseX, mouseY;
    private double camTheta = 30, camPitch = -20, camDist = 8;
    private String currentFilePath;
    private int envPreset = 0; // 0=studio 1=exterieur 2=coucher 3=nuit
    private final Gson gson = new GsonBuilder().setPrettyPrinting().create();
    private SubScene subScene;

    private static final Color BG_DARK = Color.web("#0d0f10");
    private static final Color PANEL_BG = Color.web("#1b1e21");
    private static final Color LINE_COLOR = Color.web("#2c3035");
    private static final Color ACCENT = Color.web("#35b49c");
    private static final Color TEXT = Color.web("#e8e6df");
    private static final Color MUTED = Color.web("#8a8f94");

    @Override
    public void start(Stage stage) {
        SubScene subScene = new SubScene(root3D, 800, 600, true, SceneAntialiasing.BALANCED);
        this.subScene = subScene;
        subScene.setFill(Color.web("#2a2d30"));
        camera.setNearClip(0.01);
        camera.setFarClip(1000);
        camera.setFieldOfView(60);
        subScene.setCamera(camera);

        // Lumières
        AmbientLight ambLight = new AmbientLight(Color.web("#606870", 0.5));
        ambLight.setUserData("__fixed");
        root3D.getChildren().add(ambLight);
        PointLight sun = new PointLight(Color.web("#ffeedd"));
        sun.setTranslateX(5); sun.setTranslateY(12); sun.setTranslateZ(8);
        sun.setUserData("__fixed");
        root3D.getChildren().add(sun);
        PointLight fill = new PointLight(Color.web("#88bbff"));
        fill.setTranslateX(-4); fill.setTranslateY(3); fill.setTranslateZ(-6);
        fill.setUserData("__fixed");
        root3D.getChildren().add(fill);

        // Grille + sol
        root3D.getChildren().add(addGrid());
        root3D.getChildren().add(addFloor());
        root3D.getChildren().add(terrainGroup);

        // Contrôle souris 3D
        subScene.setOnMousePressed(e -> { mouseX = e.getSceneX(); mouseY = e.getSceneY(); });
        subScene.setOnMouseDragged(e -> {
            double dx = e.getSceneX() - mouseX;
            double dy = e.getSceneY() - mouseY;
            if (e.isPrimaryButtonDown()) {
                camTheta += dx * 0.4;
                camPitch += dy * 0.4;
                camPitch = Math.max(-89, Math.min(89, camPitch));
                updateCamera();
            } else if (e.isSecondaryButtonDown()) {
                camDist += dy * 0.05;
                camDist = Math.max(3, Math.min(50, camDist));
                updateCamera();
            }
            mouseX = e.getSceneX();
            mouseY = e.getSceneY();
        });
        subScene.setOnScroll(e -> {
            camDist += e.getDeltaY() * -0.02;
            camDist = Math.max(3, Math.min(50, camDist));
            updateCamera();
        });

        // Menu contextuel C4D (clic droit)
        ContextMenu ctxMenu = new ContextMenu();
        ctxMenu.setStyle("-fx-background-color: #1e2124; -fx-text-fill: #d4d4d4; -fx-border-color: #353a40; -fx-border-radius: 6; -fx-background-radius: 6; -fx-padding: 4 0;");
        String itemStyle = "-fx-padding: 6 20; -fx-font-size: 12; -fx-text-fill: #d4d4d4;";
        String hoverStyle = "-fx-padding: 6 20; -fx-font-size: 12; -fx-text-fill: #07100e; -fx-background-color: #35b49c;";
        Runnable addCtxItem = () -> {};
        for (String[][] section : new String[][][]{
            {{"Déplacer", "W"}, {"Tourner", "E"}, {"Échelle", "R"}},
            {{"---", ""}},
            {{"Dupliquer", "Ctrl+D"}, {"Supprimer", "Del"}},
            {{"---", ""}},
            {{"Subdiviser", ""}, {"Extruder", ""}, {"Biseauter", ""}},
            {{"---", ""}},
            {{"Focus", "F"}, {"Tout sélectionner", "Ctrl+A"}, {"Désélectionner", ""}}
        }) {
            if (section[0][0].equals("---")) {
                SeparatorMenuItem sep = new SeparatorMenuItem();
                sep.setStyle("-fx-background-color: #2c3035; -fx-padding: 0 12;");
                ctxMenu.getItems().add(sep);
            } else {
                for (String[] item : section) {
                    MenuItem mi = new MenuItem(item[0] + (item[1].isEmpty() ? "" : "    " + item[1]));
                    mi.setStyle(itemStyle);
                    mi.setOnAction(e -> {
                        String label = item[0];
                        switch (label) {
                            case "Déplacer": System.out.println("Move"); break;
                            case "Tourner": System.out.println("Rotate"); break;
                            case "Échelle": System.out.println("Scale"); break;
                            case "Dupliquer": System.out.println("Duplicate"); break;
                            case "Supprimer":
                                root3D.getChildren().removeIf(n -> n.getUserData() == null || !"__fixed".equals(n.getUserData()));
                                break;
                            case "Subdiviser": System.out.println("Subdivide"); break;
                            case "Extruder": System.out.println("Extrude"); break;
                            case "Biseauter": System.out.println("Bevel"); break;
                            case "Focus": System.out.println("Focus"); break;
                            case "Tout sélectionner": System.out.println("Select All"); break;
                            case "Désélectionner": System.out.println("Deselect"); break;
                        }
                    });
                    // no onMenuValidation needed
                    ctxMenu.getItems().add(mi);
                }
            }
        }
        subScene.setOnContextMenuRequested(e -> {
            ctxMenu.show(subScene, e.getScreenX(), e.getScreenY());
        });

        // ===== Top Bar =====
        HBox topBar = new HBox(6);
        topBar.setPadding(new Insets(8, 14, 8, 14));
        topBar.setStyle("-fx-background-color: #1b1e21; -fx-border-color: #2c3035; -fx-border-width: 0 0 1 0;");
        topBar.setAlignment(Pos.CENTER_LEFT);

        Label brand = new Label("I");
        brand.setStyle("-fx-font-size: 18; -fx-font-weight: bold; -fx-text-fill: #35b49c; -fx-padding: 0 10 0 0;");
        Label title = new Label("Inerre Studio");
        title.setStyle("-fx-font-size: 13; -fx-font-weight: bold; -fx-text-fill: #e8e6df;");
        Label subtitle = new Label("Interior design 3D");
        subtitle.setStyle("-fx-font-size: 11; -fx-text-fill: #8a8f94;");
        subtitle.setPadding(new Insets(0, 20, 0, 6));

        Button btnNew = styledBtn("New");
        btnNew.setOnAction(e -> newScene(stage));
        Button btnOpen = styledBtn("Open");
        btnOpen.setOnAction(e -> openPix(stage));
        Button btnSave = styledBtn("Save");
        btnSave.setOnAction(e -> savePix(stage));
        Button btnObj = styledBtn("OBJ");
        Button btnGlb = styledBtn("GLB");
        Button btnGlbImport = styledBtn("+GLB");

        Region sep1 = new Region();
        sep1.setMinWidth(1);
        sep1.setStyle("-fx-background-color: #2c3035;");
        sep1.setMaxHeight(22);

        ToggleGroup selGroup = new ToggleGroup();
        ToggleButton selPoint = styledToggle("Point", true, selGroup);
        ToggleButton selRect = styledToggle("Cadre", false, selGroup);
        ToggleButton selLasso = styledToggle("Lasso", false, selGroup);

        topBar.getChildren().addAll(brand, title, subtitle,
            btnNew, btnOpen, btnSave, sep1, btnObj, btnGlb, btnGlbImport,
            new Region() {{ setMinWidth(10); }},
            envBtn("Studio", 0), envBtn("Ext.", 1), envBtn("Coucher", 2), envBtn("Nuit", 3),
            new Region() {{ setMinWidth(10); }},
            selPoint, selRect, selLasso);

        // ===== Panneau latéral =====
        VBox sidePanel = new VBox();
        sidePanel.setPrefWidth(220);
        sidePanel.setStyle("-fx-background-color: #1b1e21; -fx-border-color: #2c3035; -fx-border-width: 0 1 0 0;");

        // Section Primitives
        sidePanel.getChildren().add(sectionTitle("Primitives"));
        FlowPane primGrid = new FlowPane(4, 4);
        primGrid.setPadding(new Insets(0, 12, 12, 12));
        Button primCube = smallBtn("Cube", "#888888");
        primCube.setOnAction(e -> addMesh(new Box(1, 1, 1), Color.web("#888888"), 0.5));
        Button primSphere = smallBtn("Sphere", "#4da3ff");
        primSphere.setOnAction(e -> addMesh(new Sphere(0.5), Color.web("#4da3ff"), 0.5));
        Button primCone = smallBtn("Cône", "#dd8844");
        primCone.setOnAction(e -> addMesh(new Cylinder(0, 0.5, 1), Color.web("#dd8844"), 0.5));
        Button primCyl = smallBtn("Cylindre", "#888888");
        primCyl.setOnAction(e -> addMesh(new Cylinder(0.5, 1), Color.web("#888888"), 0.5));
        primGrid.getChildren().addAll(primCube, primSphere, primCone, primCyl);
        sidePanel.getChildren().add(primGrid);

        // Section Terrain
        sidePanel.getChildren().add(sectionTitle("Terrain"));
        FlowPane terrainGrid = new FlowPane(4, 4);
        terrainGrid.setPadding(new Insets(0, 12, 12, 12));
        Button btnGenTerrain = smallBtn("Générer", "#4a9e8a");
        btnGenTerrain.setOnAction(e -> generateTerrain());
        Button btnElevate = smallBtn("Élever", "#ddaa44");
        btnElevate.setOnAction(e -> sculptTerrain("raise"));
        Button btnDig = smallBtn("Creuser", "#aa6644");
        btnDig.setOnAction(e -> sculptTerrain("lower"));
        Button btnSmooth = smallBtn("Lisser", "#888888");
        btnSmooth.setOnAction(e -> sculptTerrain("smooth"));
        terrainGrid.getChildren().addAll(btnGenTerrain, btnElevate, btnDig, btnSmooth);
        sidePanel.getChildren().add(terrainGrid);

        // Section Édition
        sidePanel.getChildren().add(sectionTitle("Edition"));
        FlowPane editGrid = new FlowPane(4, 4);
        editGrid.setPadding(new Insets(0, 12, 12, 12));
        Button btnMove = smallBtn("Move", ACCENT);
        Button btnRotate = smallBtn("Rotate", ACCENT);
        Button btnScale = smallBtn("Scale", ACCENT);
        Button btnDelete = smallBtn("Delete", "#dd5544");
        btnDelete.setOnAction(e -> {
            root3D.getChildren().removeIf(n -> n.getUserData() == null || !"__fixed".equals(n.getUserData()));
        });
        Button btnClear = smallBtn("Tout effacer", "#666666");
        btnClear.setOnAction(e -> {
            root3D.getChildren().removeIf(n -> n.getUserData() == null || !"__fixed".equals(n.getUserData()));
            root3D.getChildren().add(addGrid());
            root3D.getChildren().add(addFloor());
            root3D.getChildren().add(terrainGroup);
        });
        editGrid.getChildren().addAll(btnMove, btnRotate, btnScale, btnDelete, btnClear);
        sidePanel.getChildren().add(editGrid);

        // Section Meubles
        sidePanel.getChildren().add(sectionTitle("Meubles"));
        FlowPane furnGrid = new FlowPane(4, 4);
        furnGrid.setPadding(new Insets(0, 12, 12, 12));
        for (String[] f : new String[][]{
            {"Canapé", "#bb7d5a"}, {"Table", "#c7a55a"}, {"Lampe", "#ffe7a3"},
            {"Armoire", "#8B5A2B"}, {"Lit", "#6688aa"}, {"Fauteuil", "#bb7d5a"}
        }) {
            Button b = smallBtn(f[0], Color.web(f[1]));
            b.setOnAction(e -> addFurniture(f[0], Color.web(f[1])));
            furnGrid.getChildren().add(b);
        }
        sidePanel.getChildren().add(furnGrid);

        // Section Mesh Editor
        sidePanel.getChildren().add(sectionTitle("Mesh Editor"));
        FlowPane meshGrid = new FlowPane(4, 4);
        meshGrid.setPadding(new Insets(0, 12, 12, 12));
        Button btnSubdiv = smallBtn("Subdiviser", "#4a9e8a");
        btnSubdiv.setOnAction(e -> System.out.println("Subdiviser (JavaFX)"));
        Button btnExtrude = smallBtn("Extruder", "#ddaa44");
        btnExtrude.setOnAction(e -> System.out.println("Extruder (JavaFX)"));
        Button btnSmooth2 = smallBtn("Lisser", "#888888");
        Button btnFlat = smallBtn("Faces", "#888888");
        Button btnMirror = smallBtn("Mirroir", "#6688aa");
        Button btnWeld = smallBtn("Souder", "#dd5544");
        meshGrid.getChildren().addAll(btnSubdiv, btnExtrude, btnSmooth2, btnFlat, btnMirror, btnWeld);
        sidePanel.getChildren().add(meshGrid);

        // Section AI
        sidePanel.getChildren().add(sectionTitle("AI 3D"));
        FlowPane aiGrid = new FlowPane(4, 4);
        aiGrid.setPadding(new Insets(0, 12, 12, 12));
        Button btnAI = smallBtn("Générer", "#8844cc");
        btnAI.setStyle("-fx-background-color: #3a2a5a; -fx-text-fill: #e8e6df; " +
            "-fx-border-color: #5a3a8a; -fx-border-radius: 5; -fx-background-radius: 5; " +
            "-fx-padding: 6 12; -fx-font-size: 12; -fx-cursor: hand; -fx-min-width: 62;");
        btnAI.setOnAction(e -> showAIDialog(stage));
        Label aiHint = new Label("Texte → 3D");
        aiHint.setStyle("-fx-text-fill: #8a8f94; -fx-font-size: 10; -fx-padding: 2 0 0 4;");
        aiGrid.getChildren().addAll(btnAI, aiHint);
        sidePanel.getChildren().add(aiGrid);

        // Spacer
        Region spacer = new Region();
        VBox.setVgrow(spacer, Priority.ALWAYS);
        sidePanel.getChildren().add(spacer);

        // Status bar (panneau)
        Label status = new Label("Mode: Model | Sel: Point");
        status.setStyle("-fx-background-color: #131619; -fx-text-fill: #8a8f94; -fx-font-size: 11; -fx-padding: 8 12; -fx-border-color: #2c3035; -fx-border-width: 1 0 0 0;");
        status.setMaxWidth(Double.MAX_VALUE);
        sidePanel.getChildren().add(status);

        // Barre d'état en bas
        HBox bottomBar = new HBox();
        bottomBar.setPadding(new Insets(5, 14, 5, 14));
        bottomBar.setStyle("-fx-background-color: #131619; -fx-border-color: #2c3035; -fx-border-width: 1 0 0 0;");
        Label bottomStatus = new Label("Glisser pour orbiter, Molette pour zoom | Terrain + AI actifs");
        bottomStatus.setStyle("-fx-text-fill: #8a8f94; -fx-font-size: 11;");

        HBox rightStatus = new HBox(14);
        rightStatus.setAlignment(Pos.CENTER_RIGHT);
        HBox.setHgrow(rightStatus, Priority.ALWAYS);
        Label objCount = new Label("0 objets");
        objCount.setStyle("-fx-text-fill: #8a8f94; -fx-font-size: 11;");
        rightStatus.getChildren().add(objCount);
        bottomBar.getChildren().addAll(bottomStatus, rightStatus);

        // Layout principal
        BorderPane root = new BorderPane();
        root.setTop(topBar);
        root.setLeft(sidePanel);
        root.setCenter(subScene);
        root.setBottom(bottomBar);
        root.setStyle("-fx-background-color: #0d0f10;");

        Scene scene = new Scene(root, 1280, 780);
        scene.getStylesheets().add("data:text/css," + getInlineCSS());

        stage.setTitle("Inerre Studio — Interieur design 3D");
        stage.setScene(scene);
        stage.setMinWidth(900);
        stage.setMinHeight(500);
        stage.show();

        updateCamera();
        subScene.widthProperty().bind(root.widthProperty().subtract(sidePanel.widthProperty()));
        subScene.heightProperty().bind(root.heightProperty().subtract(topBar.heightProperty()).subtract(bottomBar.heightProperty()));

        addDefaultScene();
    }

    // ===================== LANDSCAPE =====================

    private final int TERRAIN_SIZE = 65;
    private float[] terrainHeights;

    private void generateTerrain() {
        terrainGroup.getChildren().clear();
        float[] heights = new float[TERRAIN_SIZE * TERRAIN_SIZE];
        double scale = 1.5;
        for (int z = 0; z < TERRAIN_SIZE; z++) {
            for (int x = 0; x < TERRAIN_SIZE; x++) {
                double nx = x / (double) TERRAIN_SIZE * 4;
                double nz = z / (double) TERRAIN_SIZE * 4;
                double h = noise(nx, nz) * 0.8 + noise(nx * 2, nz * 2) * 0.4 + noise(nx * 4, nz * 4) * 0.2;
                heights[z * TERRAIN_SIZE + x] = (float) (h * scale);
            }
        }
        terrainHeights = heights;
        buildTerrainMesh(heights, Color.web("#5a7a5a"));
    }

    private void sculptTerrain(String mode) {
        if (terrainHeights == null) { generateTerrain(); return; }
        int cx = TERRAIN_SIZE / 2, cz = TERRAIN_SIZE / 2;
        float radius = 8;
        for (int z = 0; z < TERRAIN_SIZE; z++) {
            for (int x = 0; x < TERRAIN_SIZE; x++) {
                double dist = Math.sqrt((x - cx)*(x - cx) + (z - cz)*(z - cz));
                if (dist > radius) continue;
                double falloff = 1 - dist / radius;
                int idx = z * TERRAIN_SIZE + x;
                switch (mode) {
                    case "raise" -> terrainHeights[idx] += falloff * 0.3;
                    case "lower" -> terrainHeights[idx] -= falloff * 0.3;
                    case "smooth" -> {
                        float avg = 0; int count = 0;
                        for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++) {
                            int nz = z + dz, nx = x + dx;
                            if (nz >= 0 && nz < TERRAIN_SIZE && nx >= 0 && nx < TERRAIN_SIZE) {
                                avg += terrainHeights[nz * TERRAIN_SIZE + nx]; count++;
                            }
                        }
                        terrainHeights[idx] = (terrainHeights[idx] + avg / count) * 0.5f;
                    }
                }
            }
        }
        buildTerrainMesh(terrainHeights, Color.web("#5a7a5a"));
    }

    private void buildTerrainMesh(float[] heights, Color color) {
        terrainGroup.getChildren().clear();
        TriangleMesh mesh = new TriangleMesh();
        float size = 8f;
        float step = size / (TERRAIN_SIZE - 1);
        float half = size / 2;

        for (int z = 0; z < TERRAIN_SIZE; z++) {
            for (int x = 0; x < TERRAIN_SIZE; x++) {
                float h = heights[z * TERRAIN_SIZE + x];
                mesh.getPoints().addAll(x * step - half, h, z * step - half);
            }
        }

        float minH = Float.MAX_VALUE, maxH = Float.MIN_VALUE;
        for (float h : heights) { if (h < minH) minH = h; if (h > maxH) maxH = h; }
        float range = maxH - minH;
        if (range < 0.01f) range = 1;

        for (int z = 0; z < TERRAIN_SIZE; z++) {
            for (int x = 0; x < TERRAIN_SIZE; x++) {
                float h = (heights[z * TERRAIN_SIZE + x] - minH) / range;
                mesh.getTexCoords().addAll(x * step / size, z * step / size);
            }
        }

        for (int z = 0; z < TERRAIN_SIZE - 1; z++) {
            for (int x = 0; x < TERRAIN_SIZE - 1; x++) {
                int a = z * TERRAIN_SIZE + x;
                int b = a + 1;
                int c = (z + 1) * TERRAIN_SIZE + x;
                int d = c + 1;
                mesh.getFaces().addAll(a, 0, b, 0, c, 0);
                mesh.getFaces().addAll(b, 0, d, 0, c, 0);
            }
        }

        MeshView meshView = new MeshView(mesh);
        PhongMaterial mat = new PhongMaterial(color);
        mat.setSpecularColor(Color.web("#405050"));
        meshView.setMaterial(mat);
        terrainGroup.getChildren().add(meshView);
    }

    // Bruit de Perlin simple (valeur)
    private double noise(double x, double y) {
        int ix = (int) Math.floor(x);
        int iy = (int) Math.floor(y);
        double fx = x - ix, fy = y - iy;
        fx = fx * fx * (3 - 2 * fx);
        fy = fy * fy * (3 - 2 * fy);
        double a = hash(ix, iy);
        double b = hash(ix + 1, iy);
        double c = hash(ix, iy + 1);
        double d = hash(ix + 1, iy + 1);
        return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
    }

    private double hash(int x, int y) {
        long n = x * 374761393L + y * 668265263L;
        n = (n ^ (n >> 13)) * 1274126177L;
        return (n & 0x7fffffff) / (double) 0x7fffffff;
    }

    private double lerp(double a, double b, double t) { return a + (b - a) * t; }

    // ===================== AI GENERATOR =====================

    private void showAIDialog(Stage owner) {
        Dialog<ButtonType> dialog = new Dialog<>();
        dialog.initOwner(owner);
        dialog.setTitle("AI — Génération 3D");
        dialog.setHeaderText("Générer un modèle 3D à partir d'un texte");
        dialog.getDialogPane().setStyle("-fx-background-color: #1b1e21; -fx-text-fill: #e8e6df;");

        VBox content = new VBox(10);
        content.setPadding(new Insets(14));

        TextField promptField = new TextField();
        promptField.setPromptText("Ex: canapé moderne rouge, table en bois");
        promptField.setStyle("-fx-background-color: #22262a; -fx-text-fill: #e8e6df; -fx-prompt-text-fill: #5a5e63; -fx-border-color: #2c3035; -fx-border-radius: 4; -fx-padding: 8;");
        promptField.setPrefWidth(300);

        PasswordField keyField = new PasswordField();
        keyField.setPromptText("Clé API Hugging Face (optionnelle)");
        keyField.setStyle("-fx-background-color: #22262a; -fx-text-fill: #e8e6df; -fx-prompt-text-fill: #5a5e63; -fx-border-color: #2c3035; -fx-border-radius: 4; -fx-padding: 8;");

        Label statusLabel = new Label("Prêt");
        statusLabel.setStyle("-fx-text-fill: #8a8f94; -fx-font-size: 11;");

        content.getChildren().addAll(
            new Label("Description:") {{ setStyle("-fx-text-fill: #e8e6df; -fx-font-size: 12;"); }},
            promptField,
            new Label("Clé API:") {{ setStyle("-fx-text-fill: #e8e6df; -fx-font-size: 12;"); }},
            keyField,
            statusLabel
        );

        dialog.getDialogPane().setContent(content);
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        Button okBtn = (Button) dialog.getDialogPane().lookupButton(ButtonType.OK);
        okBtn.setText("Générer");
        okBtn.setStyle("-fx-background-color: #35b49c; -fx-text-fill: #07100e;");

        dialog.showAndWait().ifPresent(bt -> {
            if (bt == ButtonType.OK && !promptField.getText().isBlank()) {
                statusLabel.setText("Génération en cours...");
                new Thread(() -> callAIGeneration(promptField.getText(), keyField.getText())).start();
            }
        });
    }

    private void callAIGeneration(String prompt, String apiKey) {
        try {
            URL url = new URL("http://localhost:4173/api/generate");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);

            String json = "{\"prompt\":\"" + JSONEscape(prompt) + "\",\"apiKey\":\"" + JSONEscape(apiKey) + "\"}";
            try (OutputStream os = conn.getOutputStream()) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            if (code == 200) {
                System.out.println("AI: modèle généré avec succès (" + conn.getContentLengthLong() + " bytes)");
            } else {
                System.err.println("AI: échec (code " + code + ")");
            }
        } catch (Exception e) {
            System.err.println("AI: " + e.getMessage());
        }
    }

    private String JSONEscape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }

    // ===================== UI Helpers =====================

    // ===================== SAVE / LOAD .pix =====================

    private void savePix(Stage stage) {
        FileChooser fc = new FileChooser();
        fc.setTitle("Enregistrer le projet");
        fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("Projet Inerre", "*.pix"));
        if (currentFilePath != null) fc.setInitialFileName(new File(currentFilePath).getName());
        else fc.setInitialFileName("projet.pix");
        File file = fc.showSaveDialog(stage);
        if (file == null) return;

        JsonObject root = new JsonObject();
        root.addProperty("version", 2);
        root.addProperty("envPreset", envPreset);

        JsonArray arr = new JsonArray();
        for (Node n : root3D.getChildren()) {
            if (n.getUserData() != null && "__fixed".equals(n.getUserData())) continue;
            JsonObject obj = new JsonObject();
            obj.addProperty("type", "node");
            obj.addProperty("x", n.getTranslateX());
            obj.addProperty("y", n.getTranslateY());
            obj.addProperty("z", n.getTranslateZ());
            obj.addProperty("rx", n.getRotate());
            arr.add(obj);
        }
        root.add("objects", arr);

        try {
            Files.writeString(file.toPath(), gson.toJson(root));
            currentFilePath = file.getAbsolutePath();
            System.out.println("Sauvegardé: " + file.getName());
        } catch (IOException e) {
            System.err.println("Erreur sauvegarde: " + e.getMessage());
        }
    }

    private void openPix(Stage stage) {
        FileChooser fc = new FileChooser();
        fc.setTitle("Ouvrir un projet");
        fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("Projet Inerre", "*.pix", "*.inrproject"));
        File file = fc.showOpenDialog(stage);
        if (file == null) return;

        try {
            String content = Files.readString(file.toPath());
            JsonObject root = gson.fromJson(content, JsonObject.class);
            if (root.has("envPreset")) applyEnvPreset(root.get("envPreset").getAsInt());
            System.out.println("Ouvert: " + file.getName());
            currentFilePath = file.getAbsolutePath();
        } catch (IOException e) {
            System.err.println("Erreur ouverture: " + e.getMessage());
        }
    }

    private void newScene(Stage stage) {
        root3D.getChildren().removeIf(n -> n.getUserData() == null || !"__fixed".equals(n.getUserData()));
        root3D.getChildren().add(addGrid());
        root3D.getChildren().add(addFloor());
        root3D.getChildren().add(terrainGroup);
        currentFilePath = null;
    }

    // ===================== ENVIRONNEMENT =====================

    private Button envBtn(String label, int preset) {
        Button b = new Button(label);
        b.setStyle("-fx-background-color: transparent; -fx-text-fill: #8a8f94; " +
            "-fx-border-color: #2c3035; -fx-border-radius: 4; -fx-background-radius: 4; " +
            "-fx-padding: 4 8; -fx-font-size: 10; -fx-cursor: hand;");
        b.setOnAction(e -> applyEnvPreset(preset));
        return b;
    }

    private void applyEnvPreset(int preset) {
        envPreset = preset;
        Color[][] presets = {
            {Color.web("#2a2d30"), Color.web("#606870", 0.5), Color.web("#ffeedd"), Color.web("#88bbff")}, // Studio
            {Color.web("#87CEEB"), Color.web("#a0b8d0", 0.6), Color.web("#fff4e0"), Color.web("#c0d8ff")}, // Extérieur
            {Color.web("#d4783a"), Color.web("#b06040", 0.5), Color.web("#ff8844"), Color.web("#442222")}, // Coucher
            {Color.web("#0a0a14"), Color.web("#303050", 0.4), Color.web("#444466"), Color.web("#222244")}  // Nuit
        };
        Color[] p = presets[preset % presets.length];
        subScene.setFill(p[0]);

        // Mettre à jour les lumières
        for (Node n : root3D.getChildren()) {
            if (n instanceof AmbientLight) ((AmbientLight)n).setColor(p[1]);
            if (n instanceof PointLight) {
                if (n.getTranslateX() > 0) ((PointLight)n).setColor(p[2]);
                else ((PointLight)n).setColor(p[3]);
            }
        }
    }

    private void addDefaultScene() {
        addFurniture("Table", Color.web("#c7a55a"));
        addFurniture("Canapé", Color.web("#bb7d5a"));
        addFurniture("Lampe", Color.web("#ffe7a3"));
    }

    private Button styledBtn(String text) {
        Button b = new Button(text);
        b.setStyle("-fx-background-color: transparent; -fx-text-fill: #e8e6df; " +
            "-fx-border-color: #2c3035; -fx-border-radius: 5; -fx-background-radius: 5; " +
            "-fx-padding: 5 12; -fx-font-size: 12; -fx-cursor: hand;");
        b.setOnMouseEntered(e -> b.setStyle(b.getStyle().replace("-fx-background-color: transparent",
            "-fx-background-color: #2c3035")));
        b.setOnMouseExited(e -> b.setStyle(b.getStyle().replace("-fx-background-color: #2c3035",
            "-fx-background-color: transparent")));
        return b;
    }

    private ToggleButton styledToggle(String text, boolean active, ToggleGroup group) {
        ToggleButton b = new ToggleButton(text);
        b.setToggleGroup(group);
        b.setSelected(active);
        b.setStyle(active
            ? "-fx-background-color: #35b49c; -fx-text-fill: #07100e; -fx-font-weight: bold; " +
              "-fx-border: none; -fx-background-radius: 4; -fx-padding: 4 10; -fx-font-size: 11; -fx-cursor: hand;"
            : "-fx-background-color: transparent; -fx-text-fill: #8a8f94; " +
              "-fx-border: none; -fx-background-radius: 4; -fx-padding: 4 10; -fx-font-size: 11; -fx-cursor: hand;");
        b.selectedProperty().addListener((obs, old, sel) -> {
            b.setStyle(sel
                ? "-fx-background-color: #35b49c; -fx-text-fill: #07100e; -fx-font-weight: bold; " +
                  "-fx-border: none; -fx-background-radius: 4; -fx-padding: 4 10; -fx-font-size: 11;"
                : "-fx-background-color: transparent; -fx-text-fill: #8a8f94; " +
                  "-fx-border: none; -fx-background-radius: 4; -fx-padding: 4 10; -fx-font-size: 11;");
        });
        return b;
    }

    private Label sectionTitle(String text) {
        Label l = new Label(text.toUpperCase());
        l.setStyle("-fx-text-fill: #8a8f94; -fx-font-size: 11; -fx-font-weight: bold; " +
            "-fx-padding: 12 12 6 12; -fx-letter-spacing: 1;");
        return l;
    }

    private Button smallBtn(String text, Color color) {
        return smallBtn(text, color.toString().replace("0x", "#").substring(0, 7));
    }

    private Button smallBtn(String text, String colorHex) {
        Button b = new Button(text);
        b.setMaxWidth(Double.MAX_VALUE);
        b.setStyle("-fx-background-color: #22262a; -fx-text-fill: #e8e6df; " +
            "-fx-border-color: #2c3035; -fx-border-radius: 5; -fx-background-radius: 5; " +
            "-fx-padding: 6 12; -fx-font-size: 12; -fx-cursor: hand; -fx-min-width: 62;");
        b.setOnMouseEntered(e -> b.setStyle(b.getStyle().replace("#22262a", "#2c3035")));
        b.setOnMouseExited(e -> b.setStyle(b.getStyle().replace("#2c3035", "#22262a")));
        return b;
    }

    // ===================== 3D Helpers =====================

    private void updateCamera() {
        camera.getTransforms().setAll(
            new Rotate(-camPitch, 0, 0, 0, Rotate.X_AXIS),
            new Rotate(camTheta, 0, 0, 0, Rotate.Y_AXIS),
            new Translate(0, 0, camDist)
        );
    }

    private Group addGrid() {
        Group grid = new Group();
        grid.setUserData("__fixed");
        int n = 10;
        double size = 5;
        double spacing = 0.5;
        PhongMaterial mat = new PhongMaterial(Color.web("#4a9e8a"));
        PhongMaterial matCenter = new PhongMaterial(Color.web("#7ad4bc"));
        for (int i = -n; i <= n; i++) {
            Box line = new Box(0.02, 0.02, size);
            line.setTranslateX(i * spacing);
            line.setTranslateY(-0.004);
            line.setUserData("__fixed");
            line.setMaterial(i == 0 ? matCenter : mat);
            grid.getChildren().add(line);
        }
        for (int i = -n; i <= n; i++) {
            Box line = new Box(size, 0.02, 0.02);
            line.setTranslateZ(i * spacing);
            line.setTranslateY(-0.004);
            line.setUserData("__fixed");
            line.setMaterial(i == 0 ? matCenter : mat);
            grid.getChildren().add(line);
        }
        return grid;
    }

    private Node addFloor() {
        Box floor = new Box(12, 0.06, 12);
        floor.setTranslateY(-0.03);
        floor.setUserData("__fixed");
        PhongMaterial mat = new PhongMaterial(Color.web("#3a4048"));
        mat.setSpecularColor(Color.web("#608080"));
        floor.setMaterial(mat);
        return floor;
    }

    private void addMesh(Shape3D shape, Color color, double y) {
        shape.setMaterial(new PhongMaterial(color));
        shape.setTranslateY(y);
        root3D.getChildren().add(shape);
    }

    private void addFurniture(String name, Color color) {
        Group group = new Group();
        switch (name) {
            case "Canapé" -> {
                Box seat = new Box(1.6, 0.4, 0.7);
                seat.setMaterial(new PhongMaterial(color));
                Box back = new Box(1.6, 0.5, 0.12);
                back.setTranslateZ(-0.35);
                back.setTranslateY(0.15);
                back.setMaterial(new PhongMaterial(color));
                group.getChildren().addAll(seat, back);
            }
            case "Table" -> {
                Box top = new Box(1.2, 0.06, 0.7);
                top.setMaterial(new PhongMaterial(color));
                for (double dx : new double[]{-0.5, 0.5}) {
                    for (double dz : new double[]{-0.28, 0.28}) {
                        Box leg = new Box(0.04, 0.4, 0.04);
                        leg.setTranslateX(dx);
                        leg.setTranslateZ(dz);
                        leg.setTranslateY(-0.2);
                        leg.setMaterial(new PhongMaterial(Color.web("#8a8f94")));
                        group.getChildren().add(leg);
                    }
                }
                group.getChildren().add(top);
            }
            case "Lampe" -> {
                Cylinder pole = new Cylinder(0.04, 1, 8);
                pole.setMaterial(new PhongMaterial(Color.web("#8a8f94")));
                Cylinder shade = new Cylinder(0.35, 0.3, 16);
                shade.setTranslateY(0.65);
                shade.setMaterial(new PhongMaterial(color));
                group.getChildren().addAll(pole, shade);
            }
            default -> {
                Box box = new Box(0.8, 0.8, 0.8);
                box.setMaterial(new PhongMaterial(color));
                group.getChildren().add(box);
            }
        }
        group.setTranslateY(0.4);
        group.setTranslateX((Math.random() - 0.5) * 2);
        group.setTranslateZ((Math.random() - 0.5) * 2);
        root3D.getChildren().add(group);
    }

    private String getInlineCSS() {
        return """
            .root {
                -fx-font-family: 'SF Pro', 'Helvetica Neue', sans-serif;
            }
            .scroll-pane { -fx-background-color: transparent; }
            .scroll-bar:vertical {
                -fx-background-color: #131619;
                -fx-background-radius: 0;
                -fx-pref-width: 8;
            }
            .scroll-bar:vertical .thumb {
                -fx-background-color: #2c3035;
                -fx-background-radius: 4;
            }
        """;
    }

    public static void main(String[] args) { launch(); }
}
